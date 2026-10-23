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

function $open(_s_0) {
  const _a_0 = _s_0["start"];
  const _b_0 = _s_0["end"];
  const _c_0 = _s_0["ms"];
  const _d_0 = _s_0["me"];
  const _i_0 = _s_0["id"];
  return {$: "Group", "start": _a_0, "end": _b_0, "ms": _c_0, "me": _d_0, "first": _i_0, "grown": false};
}

function $raw_start(_s_0) {
  const _a_0 = _s_0["start"];
  return _a_0;
}

function $raw_end(_s_0) {
  const _b_0 = _s_0["end"];
  return _b_0;
}

function $group_end(_g_0) {
  const _b_0 = _g_0["end"];
  return _b_0;
}

function $absorb(_g_0, _s_0, _gt_0) {
  const _a_0 = _g_0["start"];
  const _b_0 = _g_0["end"];
  const _c_0 = _g_0["ms"];
  const _d_0 = _g_0["me"];
  const _f_0 = _g_0["first"];
  const _w_0 = _g_0["grown"];
  const _sb_0 = _s_0["end"];
  const _sc_0 = _s_0["ms"];
  const _sd_0 = _s_0["me"];
  if (_gt_0) {
    return {$: "Group", "start": _a_0, "end": _sb_0, "ms": (_c_0 < _sc_0 ? _c_0 : _sc_0), "me": (_d_0 > _sd_0 ? _d_0 : _sd_0), "first": _f_0, "grown": true};
  } else {
    return {$: "Group", "start": _a_0, "end": _b_0, "ms": (_c_0 < _sc_0 ? _c_0 : _sc_0), "me": (_d_0 > _sd_0 ? _d_0 : _sd_0), "first": _f_0, "grown": _w_0};
  }
}

function $step_at(_s_0, _g_0, _rest_0, _fresh_0) {
  if (_fresh_0) {
    return {$: "Con", "head": ($open(_s_0)), "tail": {$: "Con", "head": _g_0, "tail": _rest_0}};
  } else {
    return {$: "Con", "head": ($absorb(_g_0, _s_0, ($Nat_is_gt(($raw_end(_s_0)), ($group_end(_g_0)))))), "tail": _rest_0};
  }
}

function $step(_s_0, _acc_0) {
  if (_acc_0.$ === "Nil") {
    return {$: "Con", "head": ($open(_s_0)), "tail": {$: "Nil"}};
  } else {
    const _g_0 = _acc_0["head"];
    const _rest_0 = _acc_0["tail"];
    return $step_at(_s_0, _g_0, _rest_0, ($Nat_is_ge(($raw_start(_s_0)), ($group_end(_g_0)))));
  }
}

function $rev_groups($0, $1) {
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

function $merge_go($0, $1) {
  for (;;) {
    {
      const _xs_0 = $0;
      const _acc_0 = $1;
      if (_xs_0.$ === "Nil") {
        return $rev_groups(_acc_0, {$: "Nil"});
      } else {
        const _x_0 = _xs_0["head"];
        const _rest_0 = _xs_0["tail"];
        $0 = _rest_0;
        $1 = ($step(_x_0, _acc_0));
        continue;
      }
    }
  }
}

function $merge(_xs_0) {
  return $merge_go(_xs_0, {$: "Nil"});
}

function $Nat_is_gt(_a_0, _b_0) {
  return $Cmp_is_gt(cmp_new(_a_0, _b_0));
}

function $Nat_is_ge(_a_0, _b_0) {
  return $Cmp_is_ge(cmp_new(_a_0, _b_0));
}

function $Cmp_is_gt(_c_0) {
  if (_c_0.$ === "GT") {
    return true;
  } else {
    return false;
  }
}

function $Cmp_is_ge(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else {
    return true;
  }
}
export default {
  "open": run_lib((a0) => run_loop($open(a0)), 1),
  "raw.start": run_lib((a0) => run_loop($raw_start(a0)), 1),
  "raw.end": run_lib((a0) => run_loop($raw_end(a0)), 1),
  "group.end": run_lib((a0) => run_loop($group_end(a0)), 1),
  "absorb": run_lib((a0,a1,a2) => run_loop($absorb(a0,a1,a2)), 3),
  "step.at": run_lib((a0,a1,a2,a3) => run_loop($step_at(a0,a1,a2,a3)), 4),
  "step": run_lib((a0,a1) => run_loop($step(a0,a1)), 2),
  "rev.groups": run_lib((a0,a1) => run_loop($rev_groups(a0,a1)), 2),
  "merge.go": run_lib((a0,a1) => run_loop($merge_go(a0,a1)), 2),
  "merge": run_lib((a0) => run_loop($merge(a0)), 1),
};
