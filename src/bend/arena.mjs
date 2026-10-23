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

function $same(_ps_0, _bs_0) {
  if (_ps_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _ps_0["head"];
    const _h_0 = _t_0["hash"];
    if (_bs_0.$ === "Nil") {
      return false;
    } else {
      const _t_1 = _bs_0["head"];
      const _g_0 = _t_1["hash"];
      return $Nat_is_eq(_h_0, _g_0);
    }
  }
}

function $first_go($0, $1, $2, $3, $4) {
  for (;;) {
    {
      const _ps_0 = $0;
      const _bs_0 = $1;
      const _eq_0 = $2;
      const _i_0 = $3;
      const _off_0 = $4;
      if (_ps_0.$ === "Nil") {
        return {$: "None"};
      } else {
        const _pt_0 = _ps_0["tail"];
        if (_bs_0.$ === "Nil") {
          return {$: "Some", "value": {$: "First", "block": _i_0, "offset": _off_0}};
        } else {
          const _t_0 = _bs_0["head"];
          const _n_0 = _t_0["bytes"];
          const _bt_0 = _bs_0["tail"];
          if (_eq_0) {
            $0 = _pt_0;
            $1 = _bt_0;
            $2 = ($same(_pt_0, _bt_0));
            $3 = nat_chk(_i_0 + 1);
            $4 = nat_chk(_off_0 + _n_0);
            continue;
          } else {
            return {$: "Some", "value": {$: "First", "block": _i_0, "offset": _off_0}};
          }
        }
      }
    }
  }
}

function $first(_prev_0, _bs_0) {
  if (_prev_0.$ === "Fresh") {
    return {$: "None"};
  } else {
    const _ps_0 = _prev_0["seen"];
    return $first_go(_ps_0, _bs_0, ($same(_ps_0, _bs_0)), 0, 0);
  }
}

function $rev($0, $1) {
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

function $fill($0, $1, $2) {
  for (;;) {
    {
      const _bs_0 = $0;
      const _age_0 = $1;
      const _acc_0 = $2;
      if (_bs_0.$ === "Nil") {
        return $rev(_acc_0, {$: "Nil"});
      } else {
        const _rest_0 = _bs_0["tail"];
        $0 = _rest_0;
        $1 = _age_0;
        $2 = {$: "Con", "head": _age_0, "tail": _acc_0};
        continue;
      }
    }
  }
}

function $ages_go($0, $1, $2, $3, $4) {
  for (;;) {
    {
      const _ps_0 = $0;
      const _bs_0 = $1;
      const _eq_0 = $2;
      const _turn_0 = $3;
      const _acc_0 = $4;
      if (_ps_0.$ === "Nil") {
        return $fill(_bs_0, _turn_0, _acc_0);
      } else {
        const _t_0 = _ps_0["head"];
        const _a_0 = _t_0["age"];
        const _pt_0 = _ps_0["tail"];
        if (_bs_0.$ === "Nil") {
          return $rev(_acc_0, {$: "Nil"});
        } else {
          const _b_0 = _bs_0["head"];
          const _bt_0 = _bs_0["tail"];
          if (_eq_0) {
            $0 = _pt_0;
            $1 = _bt_0;
            $2 = ($same(_pt_0, _bt_0));
            $3 = _turn_0;
            $4 = {$: "Con", "head": _a_0, "tail": _acc_0};
            continue;
          } else {
            return $fill({$: "Con", "head": _b_0, "tail": _bt_0}, _turn_0, _acc_0);
          }
        }
      }
    }
  }
}

function $ages(_prev_0, _bs_0, _turn_0, _tracked_0) {
  if (_prev_0.$ === "Fresh") {
    if (_tracked_0) {
      return $fill(_bs_0, _turn_0, {$: "Nil"});
    } else {
      return $fill(_bs_0, 0, {$: "Nil"});
    }
  } else {
    const _ps_0 = _prev_0["seen"];
    return $ages_go(_ps_0, _bs_0, ($same(_ps_0, _bs_0)), _turn_0, {$: "Nil"});
  }
}

function $rev_runs($0, $1) {
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

function $cut_next(_c_0) {
  if (_c_0.$ === "NoCut") {
    return {$: "NoCut"};
  } else {
    const _t_0 = _c_0["blocks"];
    if (_t_0 === 0) {
      return {$: "NoCut"};
    } else {
      const _m_0 = (_t_0 - 1);
      return {$: "CutIn", "blocks": _m_0};
    }
  }
}

function $joins_head(_k_0, _a_0, _acc_0) {
  if (_acc_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _acc_0["head"];
    const _k2_0 = _t_0["kind"];
    const _a2_0 = _t_0["age"];
    return $Bool_and(($Nat_is_eq(_k_0, _k2_0)), ($Nat_is_eq(_a_0, _a2_0)));
  }
}

function $joins(_bs_0, _ags_0, _c_0, _acc_0) {
  if (_bs_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _bs_0["head"];
    const _k_0 = _t_0["kind"];
    if (_ags_0.$ === "Nil") {
      return false;
    } else {
      const _a_0 = _ags_0["head"];
      if (_c_0.$ === "NoCut") {
        return $joins_head(_k_0, _a_0, _acc_0);
      } else {
        const _t_1 = _c_0["blocks"];
        if (_t_1 === 0) {
          return false;
        } else {
          return $joins_head(_k_0, _a_0, _acc_0);
        }
      }
    }
  }
}

function $grow(_acc_0, _n_0) {
  if (_acc_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _t_0 = _acc_0["head"];
    const _k_0 = _t_0["kind"];
    const _m_0 = _t_0["bytes"];
    const _a_0 = _t_0["age"];
    const _rest_0 = _acc_0["tail"];
    return {$: "Con", "head": {$: "Run", "kind": _k_0, "bytes": nat_chk(_m_0 + _n_0), "age": _a_0}, "tail": _rest_0};
  }
}

function $push(_k_0, _n_0, _a_0, _acc_0) {
  return {$: "Con", "head": {$: "Run", "kind": _k_0, "bytes": _n_0, "age": _a_0}, "tail": _acc_0};
}

function $runs_go($0, $1, $2, $3, $4) {
  for (;;) {
    {
      const _bs_0 = $0;
      const _ags_0 = $1;
      const _c_0 = $2;
      const _acc_0 = $3;
      const _j_0 = $4;
      if (_bs_0.$ === "Nil") {
        return $rev_runs(_acc_0, {$: "Nil"});
      } else {
        const _t_0 = _bs_0["head"];
        const _k_0 = _t_0["kind"];
        const _n_0 = _t_0["bytes"];
        const _bt_0 = _bs_0["tail"];
        if (_ags_0.$ === "Nil") {
          return $rev_runs(_acc_0, {$: "Nil"});
        } else {
          const _a_0 = _ags_0["head"];
          const _at_0 = _ags_0["tail"];
          if (_j_0) {
            const _c2_0 = ($cut_next(_c_0));
            const _acc2_0 = ($grow(_acc_0, _n_0));
            $0 = _bt_0;
            $1 = _at_0;
            $2 = _c2_0;
            $3 = _acc2_0;
            $4 = ($joins(_bt_0, _at_0, _c2_0, _acc2_0));
            continue;
          } else {
            const _c2_1 = ($cut_next(_c_0));
            const _acc2_1 = ($push(_k_0, _n_0, _a_0, _acc_0));
            $0 = _bt_0;
            $1 = _at_0;
            $2 = _c2_1;
            $3 = _acc2_1;
            $4 = ($joins(_bt_0, _at_0, _c2_1, _acc2_1));
            continue;
          }
        }
      }
    }
  }
}

function $cut_of(_f_0) {
  if (_f_0.$ === "None") {
    return {$: "NoCut"};
  } else {
    const _t_0 = _f_0["value"];
    const _k_0 = _t_0["block"];
    return {$: "CutIn", "blocks": _k_0};
  }
}

function $runs(_bs_0, _ags_0, _f_0) {
  const _c_0 = ($cut_of(_f_0));
  return $runs_go(_bs_0, _ags_0, _c_0, {$: "Nil"}, ($joins(_bs_0, _ags_0, _c_0, {$: "Nil"})));
}

function $arena(_prev_0, _bs_0, _turn_0, _tracked_0) {
  const _ags_0 = ($ages(_prev_0, _bs_0, _turn_0, _tracked_0));
  const _f_0 = ($first(_prev_0, _bs_0));
  return {$: "Arena", "ages": _ags_0, "first": _f_0, "runs": ($runs(_bs_0, _ags_0, _f_0))};
}

function $Nat_is_eq(_a_0, _b_0) {
  return $Cmp_is_eq(cmp_new(_a_0, _b_0));
}

function $Bool_and(_a_0, _b_0) {
  if (!_a_0) {
    return false;
  } else {
    return _b_0;
  }
}

function $Cmp_is_eq(_c_0) {
  if (_c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}
export default {
  "same": run_lib((a0,a1) => run_loop($same(a0,a1)), 2),
  "first.go": run_lib((a0,a1,a2,a3,a4) => run_loop($first_go(a0,a1,a2,nat_in(a3),nat_in(a4))), 5),
  "first": run_lib((a0,a1) => run_loop($first(a0,a1)), 2),
  "rev": run_lib((a0,a1) => run_loop($rev(a0,a1)), 2),
  "fill": run_lib((a0,a1,a2) => run_loop($fill(a0,nat_in(a1),a2)), 3),
  "ages.go": run_lib((a0,a1,a2,a3,a4) => run_loop($ages_go(a0,a1,a2,nat_in(a3),a4)), 5),
  "ages": run_lib((a0,a1,a2,a3) => run_loop($ages(a0,a1,nat_in(a2),a3)), 4),
  "rev.runs": run_lib((a0,a1) => run_loop($rev_runs(a0,a1)), 2),
  "cut.next": run_lib((a0) => run_loop($cut_next(a0)), 1),
  "joins.head": run_lib((a0,a1,a2) => run_loop($joins_head(nat_in(a0),nat_in(a1),a2)), 3),
  "joins": run_lib((a0,a1,a2,a3) => run_loop($joins(a0,a1,a2,a3)), 4),
  "grow": run_lib((a0,a1) => run_loop($grow(a0,nat_in(a1))), 2),
  "push": run_lib((a0,a1,a2,a3) => run_loop($push(nat_in(a0),nat_in(a1),nat_in(a2),a3)), 4),
  "runs.go": run_lib((a0,a1,a2,a3,a4) => run_loop($runs_go(a0,a1,a2,a3,a4)), 5),
  "cut.of": run_lib((a0) => run_loop($cut_of(a0)), 1),
  "runs": run_lib((a0,a1,a2) => run_loop($runs(a0,a1,a2)), 3),
  "arena": run_lib((a0,a1,a2,a3) => run_loop($arena(a0,a1,nat_in(a2),a3)), 4),
};
