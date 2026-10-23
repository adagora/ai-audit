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

function $total(_bs_0) {
  if (_bs_0.$ === "Nil") {
    return 0;
  } else {
    const _b_0 = _bs_0["head"];
    const _rest_0 = _bs_0["tail"];
    const _x_0 = ($total(_rest_0));
    return nat_chk(_b_0 + _x_0);
  }
}

function $shares(_p_0, _t_0, _bs_0) {
  if (_bs_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _b_0 = _bs_0["head"];
    const _rest_0 = _bs_0["tail"];
    const _x_0 = nat_chk(_b_0 * _p_0);
    return {$: "Con", "head": {$: "Share", "q": ($Nat_div(_x_0, _t_0)), "r": ($Nat_mod(_x_0, _t_0)), "up": false}, "tail": ($shares(_p_0, _t_0, _rest_0))};
  }
}

function $sum_q(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _xs_0["head"];
    const _q_0 = _t_0["q"];
    const _rest_0 = _xs_0["tail"];
    const _x_0 = ($sum_q(_rest_0));
    return nat_chk(_q_0 + _x_0);
  }
}

function $pick_shift(_found_0) {
  if (_found_0.$ === "None") {
    return {$: "None"};
  } else {
    const _t_0 = _found_0["value"];
    const _i_0 = _t_0["i"];
    const _v_0 = _t_0["v"];
    return {$: "Some", "value": {$: "Pick", "i": nat_chk(_i_0 + 1), "v": _v_0}};
  }
}

function $pick_choose(_r_0, _i_0, _v_0, _ge_0) {
  if (_ge_0) {
    return {$: "Some", "value": {$: "Pick", "i": 0, "v": _r_0}};
  } else {
    return {$: "Some", "value": {$: "Pick", "i": nat_chk(_i_0 + 1), "v": _v_0}};
  }
}

function $pick_vs(_r_0, _found_0) {
  if (_found_0.$ === "None") {
    return {$: "Some", "value": {$: "Pick", "i": 0, "v": _r_0}};
  } else {
    const _t_0 = _found_0["value"];
    const _i_0 = _t_0["i"];
    const _v_0 = _t_0["v"];
    return $pick_choose(_r_0, _i_0, _v_0, ($Nat_is_ge(_r_0, _v_0)));
  }
}

function $pick_at(_y_0, _found_0) {
  const _t_0 = _y_0["r"];
  if (_t_0 === 0) {
    return $pick_shift(_found_0);
  } else {
    const _w_0 = (_t_0 - 1);
    const _t_1 = _y_0["up"];
    if (_t_1) {
      return $pick_shift(_found_0);
    } else {
      return $pick_vs(nat_chk(_w_0 + 1), _found_0);
    }
  }
}

function $pick(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _y_0 = _xs_0["head"];
    const _rest_0 = _xs_0["tail"];
    return $pick_at(_y_0, ($pick(_rest_0)));
  }
}

function $raise(_y_0) {
  const _q_0 = _y_0["q"];
  const _r_0 = _y_0["r"];
  return {$: "Share", "q": _q_0, "r": _r_0, "up": true};
}

function $bump_at(_i_0, _xs_0) {
  if (_i_0 === 0) {
    if (_xs_0.$ === "Nil") {
      return {$: "Nil"};
    } else {
      const _y_0 = _xs_0["head"];
      const _rest_0 = _xs_0["tail"];
      return {$: "Con", "head": ($raise(_y_0)), "tail": _rest_0};
    }
  } else {
    const _j_0 = (_i_0 - 1);
    if (_xs_0.$ === "Nil") {
      return {$: "Nil"};
    } else {
      const _y_1 = _xs_0["head"];
      const _rest_1 = _xs_0["tail"];
      return {$: "Con", "head": _y_1, "tail": ($bump_at(_j_0, _rest_1))};
    }
  }
}

function $step_go(_xs_0, _found_0) {
  if (_found_0.$ === "None") {
    return _xs_0;
  } else {
    const _t_0 = _found_0["value"];
    const _i_0 = _t_0["i"];
    return $bump_at(_i_0, _xs_0);
  }
}

function $step(_xs_0) {
  return $step_go(_xs_0, ($pick(_xs_0)));
}

function $rounds($0, $1) {
  for (;;) {
    {
      const _k_0 = $0;
      const _xs_0 = $1;
      if (_k_0 === 0) {
        return _xs_0;
      } else {
        const _j_0 = (_k_0 - 1);
        $0 = _j_0;
        $1 = ($step(_xs_0));
        continue;
      }
    }
  }
}

function $token(_y_0) {
  const _q_0 = _y_0["q"];
  const _t_0 = _y_0["up"];
  if (_t_0) {
    return nat_chk(_q_0 + 1);
  } else {
    return _q_0;
  }
}

function $tokens(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _y_0 = _xs_0["head"];
    const _rest_0 = _xs_0["tail"];
    return {$: "Con", "head": ($token(_y_0)), "tail": ($tokens(_rest_0))};
  }
}

function $split(_p_0, _bs_0) {
  const _xs_0 = ($shares(_p_0, ($total(_bs_0)), _bs_0));
  const _x_0 = ($sum_q(_xs_0));
  return $tokens(($rounds((_p_0 < _x_0 ? 0 : _p_0 - _x_0), _xs_0)));
}

function $Nat_div(_a_0, _b_0) {
  return $Pair_fst(nat_divmod(_a_0, _b_0));
}

function $Nat_mod(_a_0, _b_0) {
  return $Pair_snd(nat_divmod(_a_0, _b_0));
}

function $Nat_is_ge(_a_0, _b_0) {
  return $Cmp_is_ge(cmp_new(_a_0, _b_0));
}

function $Pair_fst(_p_0) {
  const _a_0 = _p_0["fst"];
  return _a_0;
}

function $Pair_snd(_p_0) {
  const _b_0 = _p_0["snd"];
  return _b_0;
}

function $Cmp_is_ge(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else {
    return true;
  }
}
export default {
  "total": run_lib((a0) => run_loop($total(a0)), 1),
  "shares": run_lib((a0,a1,a2) => run_loop($shares(nat_in(a0),nat_in(a1),a2)), 3),
  "sum_q": run_lib((a0) => run_loop($sum_q(a0)), 1),
  "pick.shift": run_lib((a0) => run_loop($pick_shift(a0)), 1),
  "pick.choose": run_lib((a0,a1,a2,a3) => run_loop($pick_choose(nat_in(a0),nat_in(a1),nat_in(a2),a3)), 4),
  "pick.vs": run_lib((a0,a1) => run_loop($pick_vs(nat_in(a0),a1)), 2),
  "pick.at": run_lib((a0,a1) => run_loop($pick_at(a0,a1)), 2),
  "pick": run_lib((a0) => run_loop($pick(a0)), 1),
  "raise": run_lib((a0) => run_loop($raise(a0)), 1),
  "bump_at": run_lib((a0,a1) => run_loop($bump_at(nat_in(a0),a1)), 2),
  "step.go": run_lib((a0,a1) => run_loop($step_go(a0,a1)), 2),
  "step": run_lib((a0) => run_loop($step(a0)), 1),
  "rounds": run_lib((a0,a1) => run_loop($rounds(nat_in(a0),a1)), 2),
  "token": run_lib((a0) => run_loop($token(a0)), 1),
  "tokens": run_lib((a0) => run_loop($tokens(a0)), 1),
  "split": run_lib((a0,a1) => run_loop($split(nat_in(a0),a1)), 2),
};
