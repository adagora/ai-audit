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

function $head_le(_bs_0, _x_0) {
  if (_bs_0.$ === "Nil") {
    return false;
  } else {
    const _b_0 = _bs_0["head"];
    return $Nat_is_le(_b_0, _x_0);
  }
}

function $adv_go($0, $1, $2, $3) {
  for (;;) {
    {
      const _bs_0 = $0;
      const _e_0 = $1;
      const _x_0 = $2;
      const _c_0 = $3;
      if (_bs_0.$ === "Nil") {
        return {$: "Tuple", "fst": _c_0, "snd": {$: "Nil"}};
      } else {
        const _b_0 = _bs_0["head"];
        const _rest_0 = _bs_0["tail"];
        if (_e_0) {
          $0 = _rest_0;
          $1 = ($head_le(_rest_0, _x_0));
          $2 = _x_0;
          $3 = {$: "Con", "head": _b_0, "tail": _c_0};
          continue;
        } else {
          return {$: "Tuple", "fst": _c_0, "snd": {$: "Con", "head": _b_0, "tail": _rest_0}};
        }
      }
    }
  }
}

function $adv(_bs_0, _x_0, _c_0) {
  return $adv_go(_bs_0, ($head_le(_bs_0, _x_0)), _x_0, _c_0);
}

function $above(_c_0, _x_0) {
  if (_c_0.$ === "Nil") {
    return false;
  } else {
    const _b_0 = _c_0["head"];
    return $Nat_is_gt(_b_0, _x_0);
  }
}

function $below(_bs_0, _x_0) {
  if (_bs_0.$ === "Nil") {
    return false;
  } else {
    const _b_0 = _bs_0["head"];
    return (_b_0 < _x_0);
  }
}

function $walk_at(_s_0, _cb_0, _acc_0) {
  const _a_0 = _s_0["start"];
  const _b_0 = _s_0["end"];
  const _c_0 = _s_0["ms"];
  const _d_0 = _s_0["me"];
  const _k_0 = _cb_0["fst"];
  const _bs_0 = _cb_0["snd"];
  const _x_0 = ($above(_k_0, _c_0));
  const _x_1 = ($below(_bs_0, _d_0));
  return {$: "Walk", "c": _k_0, "bs": _bs_0, "acc": {$: "Con", "head": {$: "Mark", "s": {$: "Span", "start": _a_0, "end": _b_0, "ms": _c_0, "me": _d_0}, "t": (_x_0 || _x_1)}, "tail": _acc_0}};
}

function $walk_step(_s_0, _w_0) {
  const _a_0 = _s_0["start"];
  const _b_0 = _s_0["end"];
  const _c_0 = _s_0["ms"];
  const _d_0 = _s_0["me"];
  const _k_0 = _w_0["c"];
  const _bs_0 = _w_0["bs"];
  const _acc_0 = _w_0["acc"];
  return $walk_at({$: "Span", "start": _a_0, "end": _b_0, "ms": _c_0, "me": _d_0}, ($adv(_bs_0, _a_0, _k_0)), _acc_0);
}

function $walk_acc(_w_0) {
  const _acc_0 = _w_0["acc"];
  return _acc_0;
}

function $walk_go($0, $1) {
  for (;;) {
    {
      const _ss_0 = $0;
      const _w_0 = $1;
      if (_ss_0.$ === "Nil") {
        return $walk_acc(_w_0);
      } else {
        const _s_0 = _ss_0["head"];
        const _rest_0 = _ss_0["tail"];
        $0 = _rest_0;
        $1 = ($walk_step(_s_0, _w_0));
        continue;
      }
    }
  }
}

function $after(_at_0, _s_0) {
  if (_at_0.$ === "None") {
    return false;
  } else {
    const _t_0 = _at_0["value"];
    const _a_0 = _t_0["start"];
    const _d2_0 = _s_0["me"];
    return (_a_0 < _d2_0);
  }
}

function $before(_at_0, _s_0) {
  if (_at_0.$ === "None") {
    return false;
  } else {
    const _t_0 = _at_0["value"];
    const _b_0 = _t_0["end"];
    const _c2_0 = _s_0["ms"];
    return $Nat_is_gt(_b_0, _c2_0);
  }
}

function $near_at(_s_0, _at_0, _grew_0, _acc_0, _e_0) {
  if (_e_0) {
    return {$: "Near", "at": {$: "Some", "value": _s_0}, "grew": true, "acc": {$: "Con", "head": {$: "Mark", "s": _s_0, "t": true}, "tail": _acc_0}};
  } else {
    return {$: "Near", "at": _at_0, "grew": _grew_0, "acc": {$: "Con", "head": {$: "Mark", "s": _s_0, "t": false}, "tail": _acc_0}};
  }
}

function $back_step(_m_0, _n_0) {
  const _s_0 = _m_0["s"];
  const _t_0 = _m_0["t"];
  if (_t_0) {
    const _grew_0 = _n_0["grew"];
    const _acc_0 = _n_0["acc"];
    return {$: "Near", "at": {$: "Some", "value": _s_0}, "grew": _grew_0, "acc": {$: "Con", "head": {$: "Mark", "s": _s_0, "t": true}, "tail": _acc_0}};
  } else {
    const _at_1 = _n_0["at"];
    const _grew_1 = _n_0["grew"];
    const _acc_1 = _n_0["acc"];
    return $near_at(_s_0, _at_1, _grew_1, _acc_1, ($after(_at_1, _s_0)));
  }
}

function $fwd_step(_m_0, _n_0) {
  const _s_0 = _m_0["s"];
  const _t_0 = _m_0["t"];
  if (_t_0) {
    const _grew_0 = _n_0["grew"];
    const _acc_0 = _n_0["acc"];
    return {$: "Near", "at": {$: "Some", "value": _s_0}, "grew": _grew_0, "acc": {$: "Con", "head": {$: "Mark", "s": _s_0, "t": true}, "tail": _acc_0}};
  } else {
    const _at_1 = _n_0["at"];
    const _grew_1 = _n_0["grew"];
    const _acc_1 = _n_0["acc"];
    return $near_at(_s_0, _at_1, _grew_1, _acc_1, ($before(_at_1, _s_0)));
  }
}

function $back_go($0, $1) {
  for (;;) {
    {
      const _ms_0 = $0;
      const _n_0 = $1;
      if (_ms_0.$ === "Nil") {
        return _n_0;
      } else {
        const _m_0 = _ms_0["head"];
        const _rest_0 = _ms_0["tail"];
        $0 = _rest_0;
        $1 = ($back_step(_m_0, _n_0));
        continue;
      }
    }
  }
}

function $fwd_go($0, $1) {
  for (;;) {
    {
      const _ms_0 = $0;
      const _n_0 = $1;
      if (_ms_0.$ === "Nil") {
        return _n_0;
      } else {
        const _m_0 = _ms_0["head"];
        const _rest_0 = _ms_0["tail"];
        $0 = _rest_0;
        $1 = ($fwd_step(_m_0, _n_0));
        continue;
      }
    }
  }
}

function $round_end(_g_0, _f_0) {
  const _g2_0 = _f_0["grew"];
  const _ms_0 = _f_0["acc"];
  return {$: "Pass", "ms": _ms_0, "grew": (_g_0 || _g2_0)};
}

function $round_fwd(_b_0) {
  const _g_0 = _b_0["grew"];
  const _ms_0 = _b_0["acc"];
  return $round_end(_g_0, ($fwd_go(_ms_0, {$: "Near", "at": {$: "None"}, "grew": false, "acc": {$: "Nil"}})));
}

function $round(_r_0) {
  return $round_fwd(($back_go(_r_0, {$: "Near", "at": {$: "None"}, "grew": false, "acc": {$: "Nil"}})));
}

function $loop($0, $1) {
  for (;;) {
    {
      const _u_0 = $0;
      const _pr_0 = $1;
      if (_u_0 === 0) {
        const _r_0 = _pr_0["ms"];
        return _r_0;
      } else {
        const _v_0 = (_u_0 - 1);
        const _r_1 = _pr_0["ms"];
        const _t_0 = _pr_0["grew"];
        if (_t_0) {
          $0 = _v_0;
          $1 = ($round(_r_1));
          continue;
        } else {
          return _r_1;
        }
      }
    }
  }
}

function $rev_go($0, $1) {
  for (;;) {
    {
      const _ms_0 = $0;
      const _acc_0 = $1;
      if (_ms_0.$ === "Nil") {
        return _acc_0;
      } else {
        const _m_0 = _ms_0["head"];
        const _rest_0 = _ms_0["tail"];
        $0 = _rest_0;
        $1 = {$: "Con", "head": _m_0, "tail": _acc_0};
        continue;
      }
    }
  }
}

function $untaken_go($0, $1) {
  for (;;) {
    {
      const _ms_0 = $0;
      const _n_0 = $1;
      if (_ms_0.$ === "Nil") {
        return _n_0;
      } else {
        const _t_0 = _ms_0["head"];
        const _t_1 = _t_0["t"];
        if (_t_1) {
          const _rest_0 = _ms_0["tail"];
          $0 = _rest_0;
          $1 = _n_0;
          continue;
        } else {
          const _rest_1 = _ms_0["tail"];
          $0 = _rest_1;
          $1 = nat_chk(_n_0 + 1);
          continue;
        }
      }
    }
  }
}

function $close(_r_0) {
  return $rev_go(($loop(($untaken_go(_r_0, 0)), {$: "Pass", "ms": _r_0, "grew": true})), {$: "Nil"});
}

function $taken(_bs_0, _ss_0) {
  return $close(($walk_go(_ss_0, {$: "Walk", "c": {$: "Nil"}, "bs": _bs_0, "acc": {$: "Nil"}})));
}

function $any_taken($0) {
  for (;;) {
    {
      const _ms_0 = $0;
      if (_ms_0.$ === "Nil") {
        return false;
      } else {
        const _t_0 = _ms_0["head"];
        const _t_1 = _t_0["t"];
        if (_t_1) {
          return true;
        } else {
          const _rest_1 = _ms_0["tail"];
          $0 = _rest_1;
          continue;
        }
      }
    }
  }
}

function $hit_back(_ms_0, _at_0) {
  if (_ms_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _ms_0["head"];
    const _s_0 = _t_0["s"];
    const _t_1 = _t_0["t"];
    if (_t_1) {
      return false;
    } else {
      return $after(_at_0, _s_0);
    }
  }
}

function $hit_fwd(_ms_0, _at_0) {
  if (_ms_0.$ === "Nil") {
    return false;
  } else {
    const _t_0 = _ms_0["head"];
    const _s_0 = _t_0["s"];
    const _t_1 = _t_0["t"];
    if (_t_1) {
      return false;
    } else {
      return $before(_at_0, _s_0);
    }
  }
}

function $back_fast($0, $1, $2, $3, $4) {
  for (;;) {
    {
      const _ms_0 = $0;
      const _e_0 = $1;
      const _at_0 = $2;
      const _grew_0 = $3;
      const _acc_0 = $4;
      if (_ms_0.$ === "Nil") {
        return {$: "Near", "at": _at_0, "grew": _grew_0, "acc": _acc_0};
      } else {
        const _t_0 = _ms_0["head"];
        const _s_0 = _t_0["s"];
        const _t_1 = _t_0["t"];
        if (_t_1) {
          const _rest_0 = _ms_0["tail"];
          if (_e_0) {
            $0 = _rest_0;
            $1 = ($hit_back(_rest_0, {$: "Some", "value": _s_0}));
            $2 = {$: "Some", "value": _s_0};
            $3 = true;
            $4 = {$: "Con", "head": {$: "Mark", "s": _s_0, "t": true}, "tail": _acc_0};
            continue;
          } else {
            $0 = _rest_0;
            $1 = ($hit_back(_rest_0, {$: "Some", "value": _s_0}));
            $2 = {$: "Some", "value": _s_0};
            $3 = _grew_0;
            $4 = {$: "Con", "head": {$: "Mark", "s": _s_0, "t": true}, "tail": _acc_0};
            continue;
          }
        } else {
          const _rest_1 = _ms_0["tail"];
          if (_e_0) {
            $0 = _rest_1;
            $1 = ($hit_back(_rest_1, {$: "Some", "value": _s_0}));
            $2 = {$: "Some", "value": _s_0};
            $3 = true;
            $4 = {$: "Con", "head": {$: "Mark", "s": _s_0, "t": true}, "tail": _acc_0};
            continue;
          } else {
            $0 = _rest_1;
            $1 = ($hit_back(_rest_1, _at_0));
            $2 = _at_0;
            $3 = _grew_0;
            $4 = {$: "Con", "head": {$: "Mark", "s": _s_0, "t": false}, "tail": _acc_0};
            continue;
          }
        }
      }
    }
  }
}

function $fwd_fast($0, $1, $2, $3, $4) {
  for (;;) {
    {
      const _ms_0 = $0;
      const _e_0 = $1;
      const _at_0 = $2;
      const _grew_0 = $3;
      const _acc_0 = $4;
      if (_ms_0.$ === "Nil") {
        return {$: "Near", "at": _at_0, "grew": _grew_0, "acc": _acc_0};
      } else {
        const _t_0 = _ms_0["head"];
        const _s_0 = _t_0["s"];
        const _t_1 = _t_0["t"];
        if (_t_1) {
          const _rest_0 = _ms_0["tail"];
          if (_e_0) {
            $0 = _rest_0;
            $1 = ($hit_fwd(_rest_0, {$: "Some", "value": _s_0}));
            $2 = {$: "Some", "value": _s_0};
            $3 = true;
            $4 = {$: "Con", "head": {$: "Mark", "s": _s_0, "t": true}, "tail": _acc_0};
            continue;
          } else {
            $0 = _rest_0;
            $1 = ($hit_fwd(_rest_0, {$: "Some", "value": _s_0}));
            $2 = {$: "Some", "value": _s_0};
            $3 = _grew_0;
            $4 = {$: "Con", "head": {$: "Mark", "s": _s_0, "t": true}, "tail": _acc_0};
            continue;
          }
        } else {
          const _rest_1 = _ms_0["tail"];
          if (_e_0) {
            $0 = _rest_1;
            $1 = ($hit_fwd(_rest_1, {$: "Some", "value": _s_0}));
            $2 = {$: "Some", "value": _s_0};
            $3 = true;
            $4 = {$: "Con", "head": {$: "Mark", "s": _s_0, "t": true}, "tail": _acc_0};
            continue;
          } else {
            $0 = _rest_1;
            $1 = ($hit_fwd(_rest_1, _at_0));
            $2 = _at_0;
            $3 = _grew_0;
            $4 = {$: "Con", "head": {$: "Mark", "s": _s_0, "t": false}, "tail": _acc_0};
            continue;
          }
        }
      }
    }
  }
}

function $round_fast_fwd(_b_0) {
  const _g_0 = _b_0["grew"];
  const _ms_0 = _b_0["acc"];
  return $round_end(_g_0, ($fwd_fast(_ms_0, ($hit_fwd(_ms_0, {$: "None"})), {$: "None"}, false, {$: "Nil"})));
}

function $round_fast(_r_0) {
  return $round_fast_fwd(($back_fast(_r_0, ($hit_back(_r_0, {$: "None"})), {$: "None"}, false, {$: "Nil"})));
}

function $loop_fast($0, $1) {
  for (;;) {
    {
      const _u_0 = $0;
      const _pr_0 = $1;
      if (_u_0 === 0) {
        const _r_0 = _pr_0["ms"];
        return _r_0;
      } else {
        const _v_0 = (_u_0 - 1);
        const _r_1 = _pr_0["ms"];
        const _t_0 = _pr_0["grew"];
        if (_t_0) {
          $0 = _v_0;
          $1 = ($round_fast(_r_1));
          continue;
        } else {
          return _r_1;
        }
      }
    }
  }
}

function $close_fast(_r_0, _e_0) {
  if (_e_0) {
    return $rev_go(($loop_fast(($untaken_go(_r_0, 0)), {$: "Pass", "ms": _r_0, "grew": true})), {$: "Nil"});
  } else {
    return $rev_go(_r_0, {$: "Nil"});
  }
}

function $taken_fast(_bs_0, _ss_0) {
  const _r_0 = ($walk_go(_ss_0, {$: "Walk", "c": {$: "Nil"}, "bs": _bs_0, "acc": {$: "Nil"}}));
  return $close_fast(_r_0, ($any_taken(_r_0)));
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
  "head_le": run_lib((a0,a1) => run_loop($head_le(a0,nat_in(a1))), 2),
  "adv.go": run_lib((a0,a1,a2,a3) => run_loop($adv_go(a0,a1,nat_in(a2),a3)), 4),
  "adv": run_lib((a0,a1,a2) => run_loop($adv(a0,nat_in(a1),a2)), 3),
  "above": run_lib((a0,a1) => run_loop($above(a0,nat_in(a1))), 2),
  "below": run_lib((a0,a1) => run_loop($below(a0,nat_in(a1))), 2),
  "walk.at": run_lib((a0,a1,a2) => run_loop($walk_at(a0,a1,a2)), 3),
  "walk.step": run_lib((a0,a1) => run_loop($walk_step(a0,a1)), 2),
  "walk.acc": run_lib((a0) => run_loop($walk_acc(a0)), 1),
  "walk.go": run_lib((a0,a1) => run_loop($walk_go(a0,a1)), 2),
  "after": run_lib((a0,a1) => run_loop($after(a0,a1)), 2),
  "before": run_lib((a0,a1) => run_loop($before(a0,a1)), 2),
  "near.at": run_lib((a0,a1,a2,a3,a4) => run_loop($near_at(a0,a1,a2,a3,a4)), 5),
  "back.step": run_lib((a0,a1) => run_loop($back_step(a0,a1)), 2),
  "fwd.step": run_lib((a0,a1) => run_loop($fwd_step(a0,a1)), 2),
  "back.go": run_lib((a0,a1) => run_loop($back_go(a0,a1)), 2),
  "fwd.go": run_lib((a0,a1) => run_loop($fwd_go(a0,a1)), 2),
  "round.end": run_lib((a0,a1) => run_loop($round_end(a0,a1)), 2),
  "round.fwd": run_lib((a0) => run_loop($round_fwd(a0)), 1),
  "round": run_lib((a0) => run_loop($round(a0)), 1),
  "loop": run_lib((a0,a1) => run_loop($loop(nat_in(a0),a1)), 2),
  "rev.go": run_lib((a0,a1) => run_loop($rev_go(a0,a1)), 2),
  "untaken.go": run_lib((a0,a1) => run_loop($untaken_go(a0,nat_in(a1))), 2),
  "close": run_lib((a0) => run_loop($close(a0)), 1),
  "taken": run_lib((a0,a1) => run_loop($taken(a0,a1)), 2),
  "any_taken": run_lib((a0) => run_loop($any_taken(a0)), 1),
  "hit.back": run_lib((a0,a1) => run_loop($hit_back(a0,a1)), 2),
  "hit.fwd": run_lib((a0,a1) => run_loop($hit_fwd(a0,a1)), 2),
  "back.fast": run_lib((a0,a1,a2,a3,a4) => run_loop($back_fast(a0,a1,a2,a3,a4)), 5),
  "fwd.fast": run_lib((a0,a1,a2,a3,a4) => run_loop($fwd_fast(a0,a1,a2,a3,a4)), 5),
  "round.fast.fwd": run_lib((a0) => run_loop($round_fast_fwd(a0)), 1),
  "round.fast": run_lib((a0) => run_loop($round_fast(a0)), 1),
  "loop.fast": run_lib((a0,a1) => run_loop($loop_fast(nat_in(a0),a1)), 2),
  "close.fast": run_lib((a0,a1) => run_loop($close_fast(a0,a1)), 2),
  "taken.fast": run_lib((a0,a1) => run_loop($taken_fast(a0,a1)), 2),
};
