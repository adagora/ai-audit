function word_to_u32(w) {
  let x = 0;
  for (let i = 0; w.$ === "WCon"; i++) {
    x |= Number(w.head) << i;
    w = w.tail;
  }
  return x >>> 0;
}

function u32_to_word(x) {
  let w = {$: "WNil"};
  for (let i = 31; i >= 0; i--) {
    w = {$: "WCon", head: ((x >>> i) & 1) === 1, tail: w};
  }
  return w;
}

function cmp_new(a, b) {
  return {$: a < b ? "LT" : a === b ? "EQ" : "GT"};
}

function nat_divmod(a, b) {
  return b === 0 ? {$: "Tuple", fst: 0, snd: a}
    : {$: "Tuple", fst: Math.trunc(a / b), snd: a % b};
}

function nat_chk(n) {
  if (n > 281474976710655) {
    throw "bend: a Nat past the largest immediate 2^48-1";
  }
  return n;
}

function nat_in(n) {
  if (!Number.isInteger(n) || n < 0 || n > 2 ** 53) {
    throw "bend: expected a Nat host number: an integer from 0 to 2^53";
  }
  return n;
}

function f32_show(x) {
  let s = "nan";
  for (let p = 1; x === x && p <= 9 && f32_round(s) !== x; p += 1) {
    s = String(Number(x.toExponential(p - 1)));
  }
  return (Object.is(x, -0) ? "-0" : s).replace("Infinity", "inf");
}

function f32_bits(x) {
  return new Uint32Array(new Float32Array([x]).buffer)[0];
}

function f32_from_bits(u) {
  return new Float32Array(new Uint32Array([u]).buffer)[0];
}

function f32_read(s) {
  const re = /^[\t\n\v\f\r ]*[+-]?((\d+(?:\.\d*)?|\.\d+)(e[+-]?\d+)?|inf(inity)?|nan)$/i;
  const v = f32_round(s.replace(/inf\w*/i, "Infinity"));
  return re.test(s) ? {$: "Some", value: v} : {$: "None"};
}

const f32_round = function f32_round(s) {
  const d = Number(s);
  const a = Math.abs(d);
  const f = Math.fround(a);
  const g = 2 * a - Math.min(f, 2 ** 128);
  if (g === f || Math.fround(g) !== g || g === Infinity) {
    return Math.sign(d) * f;
  }
  let k = 0;
  while (a * 2 ** k % 1 !== 0) {
    k += 1;
  }
  const [, i, r, e] = /(\d*)\.?(\d*)(?:e([+-]?\d+))?$/i.exec(s);
  const n = Number(e ?? 0) - r.length;
  const x = BigInt(i + r) * 2n ** BigInt(k) * 10n ** BigInt(Math.max(n, 0));
  const y = BigInt(a * 2 ** k) * 10n ** BigInt(Math.max(-n, 0));
  return Math.sign(d) * (x === y || x > y !== g > f ? f : g);
};

const char_new = function char_new(c) {
  return c < 55296 || c >= 57344 && c <= 1114111 ? String.fromCodePoint(c) : String.fromCharCode(56320, c >>> 22, c >>> 11 & 2047, c & 2047);
};

function char_len(s, at = 0) {
  return s[at] === "\uDC00" ? 4 : s.codePointAt(at) > 0xFFFF ? 2 : 1;
}

function char_code(s) {
  return s.length < 4 ? s.codePointAt(0)
    : (s.charCodeAt(1) << 22 | s.charCodeAt(2) << 11 | s.charCodeAt(3)) >>> 0;
}

function string_contains(s, p) {
  // A match must start at a Char boundary, not inside a packed U32 code.
  for (let at = 0; at <= s.length; at += char_len(s, at)) {
    if (s.startsWith(p, at)) {
      return true;
    }
  }
  return false;
}

function str_out(s) {
  return s.replace(/\uDC00[^]{3}/gu, "\uFFFD");
}

function str_in(s) {
  return s.replace(/\p{Cs}/gu, "\uFFFD");
}

// Array
// =====

function array_new(d, v) {
  if (d > 31) {
    throw "bend: an array past the deepest block class 31";
  }
  return Array(2 ** d).fill(v);
}

function array_node(a, b) {
  if (a.length !== b.length) {
    throw "bend: runtime fail-stop";
  }
  return a.concat(b);
}

function array_rmw(a, i, f) {
  const at = i % a.length;
  const old = a[at];
  a[at] = f(old);
  return {$: "Tuple", fst: a, snd: old};
}

// Run
// ===

function run_tail(f, x) {
  return {$: "$JMP", f: f.j?.f === f ? f.j : f, x};
}

function run_clo(j) {
  const f = (x) => run_loop(j(x));
  f.j = j;
  j.f = f;
  return f;
}

function run_loop(r) {
  while (r !== null && typeof r === "object" && r.$ === "$JMP") {
    r = r.f(r.x);
  }
  return r;
}

function run_lib(f, n) {
  return (...a) => a.length < n ? run_lib((...b) => f(...a, ...b), n - a.length)
    : run_loop(f(...a));
}

// Effect
// ======

const $0eff = Object.create(null);

function io_eff(k, run) {
  if (arguments.length > 2) {
    throw new Error("bend: " + k + " takes no need: an effect that waits parks itself");
  }
  if (k in $0eff) {
    throw new Error("bend: two effects register " + k);
  }
  $0eff[k] = run;
}
// Program
// =======

function $rev_pieces($0, $1) {
  for (;;) {
    {
      const _xs_0 = $0;
      const _acc_0 = $1;
      if (_xs_0.$ === "Nil") {
        return _acc_0;
      } else {
        const _x_0 = _xs_0["head"];
        const _rest_0 = _xs_0["tail"];
        $0 = _rest_0;
        $1 = {$: "Con", "head": _x_0, "tail": _acc_0};
        continue;
      }
    }
  }
}

function $rev_parts($0, $1) {
  for (;;) {
    {
      const _xs_0 = $0;
      const _acc_0 = $1;
      if (_xs_0.$ === "Nil") {
        return _acc_0;
      } else {
        const _x_0 = _xs_0["head"];
        const _rest_0 = _xs_0["tail"];
        $0 = _rest_0;
        $1 = {$: "Con", "head": _x_0, "tail": _acc_0};
        continue;
      }
    }
  }
}

function $starts_from(_ss_0, _x_0) {
  if (_ss_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _ss_0["head"];
    const _a_0 = _t_0["start"];
    return $Nat_is_ge(_a_0, _x_0);
  }
}

function $ends_by(_ss_0, _x_0) {
  if (_ss_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _ss_0["head"];
    const _b_0 = _t_0["end"];
    return $Nat_is_le(_b_0, _x_0);
  }
}

function $part_go($0, $1, $2, $3, $4, $5, $6, $7) {
  for (;;) {
    {
      const _ss_0 = $0;
      const _late_0 = $1;
      const _fresh_0 = $2;
      const _short_0 = $3;
      const _i_0 = $4;
      const _pos_0 = $5;
      const _hi_0 = $6;
      const _acc_0 = $7;
      if (_ss_0.$ === "Nil") {
        return {$: "Part", "ss": {$: "Nil"}, "i": _i_0, "pieces": ($rev_pieces({$: "Con", "head": {$: "Keep", "from": _pos_0, "to": _hi_0}, "tail": _acc_0}, {$: "Nil"}))};
      } else {
        const _t_0 = _ss_0["head"];
        const _a_0 = _t_0["start"];
        const _b_0 = _t_0["end"];
        const _rest_0 = _ss_0["tail"];
        if (_late_0) {
          return {$: "Part", "ss": {$: "Con", "head": {$: "Cut", "start": _a_0, "end": _b_0}, "tail": _rest_0}, "i": _i_0, "pieces": ($rev_pieces({$: "Con", "head": {$: "Keep", "from": _pos_0, "to": _hi_0}, "tail": _acc_0}, {$: "Nil"}))};
        } else {
          if (_fresh_0) {
            if (_short_0) {
              $0 = _rest_0;
              $1 = ($starts_from(_rest_0, _hi_0));
              $2 = ($starts_from(_rest_0, _b_0));
              $3 = ($ends_by(_rest_0, _hi_0));
              $4 = nat_chk(_i_0 + 1);
              $5 = _b_0;
              $6 = _hi_0;
              $7 = {$: "Con", "head": {$: "Hide", "i": _i_0}, "tail": {$: "Con", "head": {$: "Keep", "from": _pos_0, "to": _a_0}, "tail": _acc_0}};
              continue;
            } else {
              return {$: "Part", "ss": {$: "Con", "head": {$: "Cut", "start": _a_0, "end": _b_0}, "tail": _rest_0}, "i": _i_0, "pieces": ($rev_pieces({$: "Con", "head": {$: "Hide", "i": _i_0}, "tail": {$: "Con", "head": {$: "Keep", "from": _pos_0, "to": _a_0}, "tail": _acc_0}}, {$: "Nil"}))};
            }
          } else {
            if (_short_0) {
              $0 = _rest_0;
              $1 = ($starts_from(_rest_0, _hi_0));
              $2 = ($starts_from(_rest_0, _b_0));
              $3 = ($ends_by(_rest_0, _hi_0));
              $4 = nat_chk(_i_0 + 1);
              $5 = _b_0;
              $6 = _hi_0;
              $7 = _acc_0;
              continue;
            } else {
              return {$: "Part", "ss": {$: "Con", "head": {$: "Cut", "start": _a_0, "end": _b_0}, "tail": _rest_0}, "i": _i_0, "pieces": ($rev_pieces(_acc_0, {$: "Nil"}))};
            }
          }
        }
      }
    }
  }
}

function $part(_ss_0, _i_0, _lo_0, _hi_0) {
  return $part_go(_ss_0, ($starts_from(_ss_0, _hi_0)), ($starts_from(_ss_0, _lo_0)), ($ends_by(_ss_0, _hi_0)), _i_0, _lo_0, _hi_0, {$: "Nil"});
}

function $parts_go($0, $1, $2, $3) {
  for (;;) {
    {
      const _bs_0 = $0;
      const _st_0 = $1;
      const _lo_0 = $2;
      const _done_0 = $3;
      if (_bs_0.$ === "Nil") {
        const _ps_0 = _st_0["pieces"];
        return $rev_parts({$: "Con", "head": _ps_0, "tail": _done_0}, {$: "Nil"});
      } else {
        const _hi_0 = _bs_0["head"];
        const _rest_0 = _bs_0["tail"];
        const _ss_1 = _st_0["ss"];
        const _i_1 = _st_0["i"];
        const _ps_1 = _st_0["pieces"];
        $0 = _rest_0;
        $1 = ($part(_ss_1, _i_1, _lo_0, _hi_0));
        $2 = _hi_0;
        $3 = {$: "Con", "head": _ps_1, "tail": _done_0};
        continue;
      }
    }
  }
}

function $cut(_bs_0, _ss_0) {
  if (_bs_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _hi_0 = _bs_0["head"];
    const _rest_0 = _bs_0["tail"];
    return $parts_go(_rest_0, ($part(_ss_0, 0, 0, _hi_0)), _hi_0, {$: "Nil"});
  }
}

function $Nat_is_ge(_a_0, _b_0) {
  return $Cmp_is_ge(cmp_new(_a_0, _b_0));
}

function $Nat_is_le(_a_0, _b_0) {
  return $Cmp_is_le(cmp_new(_a_0, _b_0));
}

function $Cmp_is_ge(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else {
    return true;
  }
}

function $Cmp_is_le(_c_0) {
  if (_c_0.$ === "GT") {
    return false;
  } else {
    return true;
  }
}
export default {
  "rev.pieces": run_lib((a0,a1) => run_loop($rev_pieces(a0,a1)), 2),
  "rev.parts": run_lib((a0,a1) => run_loop($rev_parts(a0,a1)), 2),
  "starts_from": run_lib((a0,a1) => run_loop($starts_from(a0,nat_in(a1))), 2),
  "ends_by": run_lib((a0,a1) => run_loop($ends_by(a0,nat_in(a1))), 2),
  "part.go": run_lib((a0,a1,a2,a3,a4,a5,a6,a7) => run_loop($part_go(a0,a1,a2,a3,nat_in(a4),nat_in(a5),nat_in(a6),a7)), 8),
  "part": run_lib((a0,a1,a2,a3) => run_loop($part(a0,nat_in(a1),nat_in(a2),nat_in(a3))), 4),
  "parts.go": run_lib((a0,a1,a2,a3) => run_loop($parts_go(a0,a1,nat_in(a2),a3)), 4),
  "cut": run_lib((a0,a1) => run_loop($cut(a0,a1)), 2),
};
