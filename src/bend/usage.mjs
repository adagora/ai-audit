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

function $or0(_m_0) {
  if (_m_0.$ === "None") {
    return 0;
  } else {
    const _n_0 = _m_0["value"];
    return _n_0;
  }
}

function $turn_known(_anthropic_0, _n_0, _o_0, _c_0, _w_0) {
  if (_anthropic_0) {
    const _x_0 = ($or0(_c_0));
    const _x_1 = nat_chk(_n_0 + _x_0);
    const _x_2 = ($or0(_w_0));
    return {$: "Turn", "read": {$: "Some", "value": ($or0(_c_0))}, "write": {$: "Some", "value": ($or0(_w_0))}, "input": {$: "Some", "value": _n_0}, "output": _o_0, "prompt": {$: "Some", "value": nat_chk(_x_1 + _x_2)}};
  } else {
    const _x_3 = ($or0(_c_0));
    return {$: "Turn", "read": {$: "Some", "value": ($or0(_c_0))}, "write": {$: "None"}, "input": {$: "Some", "value": (_n_0 < _x_3 ? 0 : _n_0 - _x_3)}, "output": _o_0, "prompt": {$: "Some", "value": _n_0}};
  }
}

function $turn(_anthropic_0, _u_0) {
  const _t_0 = _u_0["input"];
  if (_t_0.$ === "None") {
    const _o_0 = _u_0["output"];
    return {$: "Turn", "read": {$: "None"}, "write": {$: "None"}, "input": {$: "None"}, "output": _o_0, "prompt": {$: "None"}};
  } else {
    const _n_0 = _t_0["value"];
    const _o_1 = _u_0["output"];
    const _c_1 = _u_0["cached"];
    const _w_1 = _u_0["write"];
    return $turn_known(_anthropic_0, _n_0, _o_1, _c_1, _w_1);
  }
}

function $drop_expect(_before_0, _anthropic_0) {
  const _r_0 = _before_0["read"];
  const _w_0 = _before_0["write"];
  const _t_0 = _before_0["prompt"];
  if (_t_0.$ === "None") {
    return {$: "None"};
  } else {
    const _pp_0 = _t_0["value"];
    if (_anthropic_0) {
      const _x_0 = ($or0(_r_0));
      const _x_1 = ($or0(_w_0));
      return {$: "Some", "value": nat_chk(_x_0 + _x_1)};
    } else {
      return {$: "Some", "value": _pp_0};
    }
  }
}

function $drop_at(_e_0, _now_0) {
  if (_now_0.$ === "None") {
    return false;
  } else {
    const _c_0 = _now_0["value"];
    const _x_0 = nat_chk(_c_0 + _c_0);
    return $Bool_and(($Nat_is_ge(_e_0, 1024)), (_x_0 < _e_0));
  }
}

function $drop_go(_e_0, _now_0) {
  if (_e_0.$ === "None") {
    return false;
  } else {
    const _x_0 = _e_0["value"];
    const _r_0 = _now_0["read"];
    return $drop_at(_x_0, _r_0);
  }
}

function $drop(_anthropic_0, _now_0, _before_0) {
  return $drop_go(($drop_expect(_before_0, _anthropic_0)), _now_0);
}

function $unknown(_m_0) {
  if (_m_0.$ === "None") {
    return 1;
  } else {
    return 0;
  }
}

function $unknown2(_i_0, _o_0) {
  if (_i_0.$ === "None") {
    return 1;
  } else {
    return $unknown(_o_0);
  }
}

function $add_call(_c_0, _t_0) {
  const _t_1 = _c_0["billed"];
  if (!_t_1) {
    return _t_0;
  } else {
    const _i_1 = _c_0["input"];
    const _o_1 = _c_0["output"];
    const _ti_0 = _t_0["input"];
    const _to_0 = _t_0["output"];
    const _ui_0 = _t_0["unknownInput"];
    const _uo_0 = _t_0["unknownOutput"];
    const _uu_0 = _t_0["unknownUsage"];
    const _x_0 = ($or0(_i_1));
    const _x_1 = ($or0(_o_1));
    const _x_2 = ($unknown(_i_1));
    const _x_3 = ($unknown(_o_1));
    const _x_4 = ($unknown2(_i_1, _o_1));
    return {$: "Totals", "input": nat_chk(_ti_0 + _x_0), "output": nat_chk(_to_0 + _x_1), "unknownInput": nat_chk(_ui_0 + _x_2), "unknownOutput": nat_chk(_uo_0 + _x_3), "unknownUsage": nat_chk(_uu_0 + _x_4)};
  }
}

function $totals_go($0, $1) {
  for (;;) {
    {
      const _cs_0 = $0;
      const _t_0 = $1;
      if (_cs_0.$ === "Nil") {
        return _t_0;
      } else {
        const _c_0 = _cs_0["head"];
        const _rest_0 = _cs_0["tail"];
        $0 = _rest_0;
        $1 = ($add_call(_c_0, _t_0));
        continue;
      }
    }
  }
}

function $totals(_cs_0) {
  return $totals_go(_cs_0, {$: "Totals", "input": 0, "output": 0, "unknownInput": 0, "unknownOutput": 0, "unknownUsage": 0});
}

function $Bool_and(_a_0, _b_0) {
  if (!_a_0) {
    return false;
  } else {
    return _b_0;
  }
}

function $Nat_is_ge(_a_0, _b_0) {
  return $Cmp_is_ge(cmp_new(_a_0, _b_0));
}

function $Cmp_is_ge(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else {
    return true;
  }
}
export default {
  "or0": run_lib((a0) => run_loop($or0(a0)), 1),
  "turn.known": run_lib((a0,a1,a2,a3,a4) => run_loop($turn_known(a0,nat_in(a1),a2,a3,a4)), 5),
  "turn": run_lib((a0,a1) => run_loop($turn(a0,a1)), 2),
  "drop.expect": run_lib((a0,a1) => run_loop($drop_expect(a0,a1)), 2),
  "drop.at": run_lib((a0,a1) => run_loop($drop_at(nat_in(a0),a1)), 2),
  "drop.go": run_lib((a0,a1) => run_loop($drop_go(a0,a1)), 2),
  "drop": run_lib((a0,a1,a2) => run_loop($drop(a0,a1,a2)), 3),
  "unknown": run_lib((a0) => run_loop($unknown(a0)), 1),
  "unknown2": run_lib((a0,a1) => run_loop($unknown2(a0,a1)), 2),
  "add.call": run_lib((a0,a1) => run_loop($add_call(a0,a1)), 2),
  "totals.go": run_lib((a0,a1) => run_loop($totals_go(a0,a1)), 2),
  "totals": run_lib((a0) => run_loop($totals(a0)), 1),
};
