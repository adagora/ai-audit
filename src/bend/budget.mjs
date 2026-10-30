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

function $fits(_used_0, _request_0, _limit_0) {
  return $Bool_and(($Nat_is_le(_used_0, _limit_0)), ($Nat_is_le(_request_0, (_limit_0 < _used_0 ? 0 : _limit_0 - _used_0))));
}

function $admit_fits(_ok_0) {
  if (_ok_0) {
    return {$: "Ok"};
  } else {
    return {$: "Exceeded"};
  }
}

function $admit(_blocked_0, _usedInput_0, _usedOutput_0, _input_0, _output_0, _limitInput_0, _limitOutput_0) {
  if (_blocked_0) {
    return {$: "Blocked"};
  } else {
    return $admit_fits(($Bool_and(($fits(_usedInput_0, _input_0, _limitInput_0)), ($fits(_usedOutput_0, _output_0, _limitOutput_0)))));
  }
}

function $or0(_m_0) {
  if (_m_0.$ === "None") {
    return 0;
  } else {
    const _n_0 = _m_0["value"];
    return _n_0;
  }
}

function $complete(_anthropic_0, _input_0, _cached_0, _write_0) {
  if (_anthropic_0) {
    if (_input_0.$ === "Some") {
      const _n_0 = _input_0["value"];
      const _x_0 = ($or0(_cached_0));
      const _x_1 = nat_chk(_n_0 + _x_0);
      const _x_2 = ($or0(_write_0));
      return {$: "Some", "value": nat_chk(_x_1 + _x_2)};
    } else {
      return _input_0;
    }
  } else {
    return _input_0;
  }
}

function $charged(_m_0, _reserved_0) {
  if (_m_0.$ === "None") {
    return _reserved_0;
  } else {
    const _n_0 = _m_0["value"];
    return _n_0;
  }
}

function $known(_m_0) {
  if (_m_0.$ === "None") {
    return false;
  } else {
    return true;
  }
}

function $charge_of(_i_0, _o_0, _reservedInput_0, _reservedOutput_0) {
  const _x_0 = ($Nat_is_gt(($charged(_i_0, _reservedInput_0)), _reservedInput_0));
  const _x_1 = ($Nat_is_gt(($charged(_o_0, _reservedOutput_0)), _reservedOutput_0));
  return {$: "Charge", "input": ($charged(_i_0, _reservedInput_0)), "output": ($charged(_o_0, _reservedOutput_0)), "inputKnown": ($known(_i_0)), "outputKnown": ($known(_o_0)), "overrun": (_x_0 || _x_1)};
}

function $charge(_anthropic_0, _reservedInput_0, _reservedOutput_0, _input_0, _cached_0, _write_0, _output_0) {
  return $charge_of(($complete(_anthropic_0, _input_0, _cached_0, _write_0)), _output_0, _reservedInput_0, _reservedOutput_0);
}

function $Bool_and(_a_0, _b_0) {
  if (!_a_0) {
    return false;
  } else {
    return _b_0;
  }
}

function $Nat_is_le(_a_0, _b_0) {
  return $Cmp_is_le(cmp_new(_a_0, _b_0));
}

function $Nat_is_gt(_a_0, _b_0) {
  return $Cmp_is_gt(cmp_new(_a_0, _b_0));
}

function $Cmp_is_le(_c_0) {
  if (_c_0.$ === "GT") {
    return false;
  } else {
    return true;
  }
}

function $Cmp_is_gt(_c_0) {
  if (_c_0.$ === "GT") {
    return true;
  } else {
    return false;
  }
}
export default {
  "fits": run_lib((a0,a1,a2) => run_loop($fits(nat_in(a0),nat_in(a1),nat_in(a2))), 3),
  "admit.fits": run_lib((a0) => run_loop($admit_fits(a0)), 1),
  "admit": run_lib((a0,a1,a2,a3,a4,a5,a6) => run_loop($admit(a0,nat_in(a1),nat_in(a2),nat_in(a3),nat_in(a4),nat_in(a5),nat_in(a6))), 7),
  "or0": run_lib((a0) => run_loop($or0(a0)), 1),
  "complete": run_lib((a0,a1,a2,a3) => run_loop($complete(a0,a1,a2,a3)), 4),
  "charged": run_lib((a0,a1) => run_loop($charged(a0,nat_in(a1))), 2),
  "known": run_lib((a0) => run_loop($known(a0)), 1),
  "charge.of": run_lib((a0,a1,a2,a3) => run_loop($charge_of(a0,a1,nat_in(a2),nat_in(a3))), 4),
  "charge": run_lib((a0,a1,a2,a3,a4,a5,a6) => run_loop($charge(a0,nat_in(a1),nat_in(a2),a3,a4,a5,a6)), 7),
};
