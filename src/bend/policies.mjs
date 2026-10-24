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

function $get($0, $1) {
  for (;;) {
    {
      const _k_0 = $0;
      const _t_0 = $1;
      if (_k_0.$ === "Nil") {
        if (_t_0.$ === "Tip") {
          return {$: "None"};
        } else {
          const _h_0 = _t_0["here"];
          return _h_0;
        }
      } else {
        const _t_1 = _k_0["head"];
        if (_t_1) {
          const _rest_0 = _k_0["tail"];
          if (_t_0.$ === "Tip") {
            return {$: "None"};
          } else {
            const _o_1 = _t_0["one"];
            $0 = _rest_0;
            $1 = _o_1;
            continue;
          }
        } else {
          const _rest_1 = _k_0["tail"];
          if (_t_0.$ === "Tip") {
            return {$: "None"};
          } else {
            const _z_2 = _t_0["zero"];
            $0 = _rest_1;
            $1 = _z_2;
            continue;
          }
        }
      }
    }
  }
}

function $set(_k_0, _t_0, _v_0) {
  if (_k_0.$ === "Nil") {
    if (_t_0.$ === "Tip") {
      return {$: "Bin", "here": {$: "Some", "value": _v_0}, "zero": {$: "Tip"}, "one": {$: "Tip"}};
    } else {
      const _z_0 = _t_0["zero"];
      const _o_0 = _t_0["one"];
      return {$: "Bin", "here": {$: "Some", "value": _v_0}, "zero": _z_0, "one": _o_0};
    }
  } else {
    const _t_1 = _k_0["head"];
    if (_t_1) {
      const _rest_0 = _k_0["tail"];
      if (_t_0.$ === "Tip") {
        return {$: "Bin", "here": {$: "None"}, "zero": {$: "Tip"}, "one": ($set(_rest_0, {$: "Tip"}, _v_0))};
      } else {
        const _h_1 = _t_0["here"];
        const _z_1 = _t_0["zero"];
        const _o_1 = _t_0["one"];
        return {$: "Bin", "here": _h_1, "zero": _z_1, "one": ($set(_rest_0, _o_1, _v_0))};
      }
    } else {
      const _rest_1 = _k_0["tail"];
      if (_t_0.$ === "Tip") {
        return {$: "Bin", "here": {$: "None"}, "zero": ($set(_rest_1, {$: "Tip"}, _v_0)), "one": {$: "Tip"}};
      } else {
        const _h_2 = _t_0["here"];
        const _z_2 = _t_0["zero"];
        const _o_2 = _t_0["one"];
        return {$: "Bin", "here": _h_2, "zero": ($set(_rest_1, _z_2, _v_0)), "one": _o_2};
      }
    }
  }
}

function $bump(_m_0, _i_0) {
  if (_m_0.$ === "None") {
    return {$: "Stat", "first": _i_0, "last": _i_0, "count": 1};
  } else {
    const _t_0 = _m_0["value"];
    const _f_0 = _t_0["first"];
    const _c_0 = _t_0["count"];
    return {$: "Stat", "first": _f_0, "last": _i_0, "count": nat_chk(_c_0 + 1)};
  }
}

function $note(_m_0, _s_0, _order_0) {
  if (_m_0.$ === "None") {
    return {$: "Con", "head": _s_0, "tail": _order_0};
  } else {
    return _order_0;
  }
}

function $visit_found(_m_0, _s_0, _i_0, _order_0, _src_0) {
  return {$: "Group", "current": _s_0, "order": ($note(_m_0, _s_0, _order_0)), "sources": ($set(_s_0, _src_0, ($bump(_m_0, _i_0))))};
}

function $visit(_grp_0, _s_0, _i_0) {
  const _order_0 = _grp_0["order"];
  const _src_0 = _grp_0["sources"];
  return $visit_found(($get(_s_0, _src_0)), _s_0, _i_0, _order_0, _src_0);
}

function $step_found(_m_0, _g_0, _s_0, _i_0, _order_0, _groups_0) {
  if (_m_0.$ === "None") {
    return {$: "State", "order": {$: "Con", "head": _g_0, "tail": _order_0}, "groups": ($set(_g_0, _groups_0, ($visit({$: "Group", "current": {$: "Nil"}, "order": {$: "Nil"}, "sources": {$: "Tip"}}, _s_0, _i_0))))};
  } else {
    const _grp_0 = _m_0["value"];
    return {$: "State", "order": _order_0, "groups": ($set(_g_0, _groups_0, ($visit(_grp_0, _s_0, _i_0))))};
  }
}

function $step(_st_0, _g_0, _s_0, _i_0) {
  const _order_0 = _st_0["order"];
  const _groups_0 = _st_0["groups"];
  return $step_found(($get(_g_0, _groups_0)), _g_0, _s_0, _i_0, _order_0, _groups_0);
}

function $go($0, $1, $2) {
  for (;;) {
    {
      const _ds_0 = $0;
      const _i_0 = $1;
      const _st_0 = $2;
      if (_ds_0.$ === "Nil") {
        return _st_0;
      } else {
        const _t_0 = _ds_0["head"];
        const _g_0 = _t_0["group"];
        const _s_0 = _t_0["source"];
        const _rest_0 = _ds_0["tail"];
        $0 = _rest_0;
        $1 = nat_chk(_i_0 + 1);
        $2 = ($step(_st_0, _g_0, _s_0, _i_0));
        continue;
      }
    }
  }
}

function $version(_k_0, _m_0) {
  if (_m_0.$ === "None") {
    return {$: "Version", "source": _k_0, "stat": {$: "Stat", "first": 0, "last": 0, "count": 0}};
  } else {
    const _st_0 = _m_0["value"];
    return {$: "Version", "source": _k_0, "stat": _st_0};
  }
}

function $versions($0, $1, $2) {
  for (;;) {
    {
      const _ks_0 = $0;
      const _src_0 = $1;
      const _acc_0 = $2;
      if (_ks_0.$ === "Nil") {
        return _acc_0;
      } else {
        const _k_0 = _ks_0["head"];
        const _rest_0 = _ks_0["tail"];
        $0 = _rest_0;
        $1 = _src_0;
        $2 = {$: "Con", "head": ($version(_k_0, ($get(_k_0, _src_0)))), "tail": _acc_0};
        continue;
      }
    }
  }
}

function $history(_k_0, _m_0) {
  if (_m_0.$ === "None") {
    return {$: "History", "group": _k_0, "versions": {$: "Nil"}, "current": _k_0};
  } else {
    const _t_0 = _m_0["value"];
    const _cur_0 = _t_0["current"];
    const _order_0 = _t_0["order"];
    const _src_0 = _t_0["sources"];
    return {$: "History", "group": _k_0, "versions": ($versions(_order_0, _src_0, {$: "Nil"})), "current": _cur_0};
  }
}

function $histories_go($0, $1, $2) {
  for (;;) {
    {
      const _ks_0 = $0;
      const _gs_0 = $1;
      const _acc_0 = $2;
      if (_ks_0.$ === "Nil") {
        return _acc_0;
      } else {
        const _k_0 = _ks_0["head"];
        const _rest_0 = _ks_0["tail"];
        $0 = _rest_0;
        $1 = _gs_0;
        $2 = {$: "Con", "head": ($history(_k_0, ($get(_k_0, _gs_0)))), "tail": _acc_0};
        continue;
      }
    }
  }
}

function $finish(_st_0) {
  const _order_0 = _st_0["order"];
  const _groups_0 = _st_0["groups"];
  return $histories_go(_order_0, _groups_0, {$: "Nil"});
}

function $histories(_ds_0) {
  return $finish(($go(_ds_0, 0, {$: "State", "order": {$: "Nil"}, "groups": {$: "Tip"}})));
}
export default {
  "get": run_lib((a0,a1) => run_loop($get(a0,a1)), 2),
  "set": run_lib((a0,a1,a2) => run_loop($set(a0,a1,a2)), 3),
  "bump": run_lib((a0,a1) => run_loop($bump(a0,nat_in(a1))), 2),
  "note": run_lib((a0,a1,a2) => run_loop($note(a0,a1,a2)), 3),
  "visit.found": run_lib((a0,a1,a2,a3,a4) => run_loop($visit_found(a0,a1,nat_in(a2),a3,a4)), 5),
  "visit": run_lib((a0,a1,a2) => run_loop($visit(a0,a1,nat_in(a2))), 3),
  "step.found": run_lib((a0,a1,a2,a3,a4,a5) => run_loop($step_found(a0,a1,a2,nat_in(a3),a4,a5)), 6),
  "step": run_lib((a0,a1,a2,a3) => run_loop($step(a0,a1,a2,nat_in(a3))), 4),
  "go": run_lib((a0,a1,a2) => run_loop($go(a0,nat_in(a1),a2)), 3),
  "version": run_lib((a0,a1) => run_loop($version(a0,a1)), 2),
  "versions": run_lib((a0,a1,a2) => run_loop($versions(a0,a1,a2)), 3),
  "history": run_lib((a0,a1) => run_loop($history(a0,a1)), 2),
  "histories.go": run_lib((a0,a1,a2) => run_loop($histories_go(a0,a1,a2)), 3),
  "finish": run_lib((a0) => run_loop($finish(a0)), 1),
  "histories": run_lib((a0) => run_loop($histories(a0)), 1),
};
