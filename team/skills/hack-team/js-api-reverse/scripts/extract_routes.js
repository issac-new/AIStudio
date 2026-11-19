#!/usr/bin/env node
/**
 * extract_routes.js — AST 路由穷举：解析前端 JS，提取全量 API 路由 + 参数表 + GraphQL 操作表
 *
 * 来源：融合 W2-A（模式参考 S3 reverse-skill skills/api-security，按模式自写，禁 vendor 正文）
 * 依赖：acorn（本机 ~/.hermes/hermes-agent/node_modules 实证在位；acorn-walk 缺失 → 本脚本内置手写 walker）
 *
 * 用法：
 *   node extract_routes.js <file.js | dir> [more paths...] [--json out.json]
 *   node extract_routes.js --selftest          # 零网络自测，exit=0 才可用
 *
 * 输出：stdout 摘要表 +（可选）--json 落盘
 *   { routes: [{path, methods, params, data_keys, template, file}],
 *     graphql: [{op, type, file}] }
 */
'use strict';
const fs = require('fs');
const path = require('path');
// acorn 解析回退链：就近 node_modules → hermes-agent 实证在位副本（2026-11-02 核验）
function loadAcorn() {
  try { return require('acorn'); } catch (e) {}
  const candidates = [
    path.join(process.env.HERMES_HOME || path.join(require('os').homedir(), '.hermes'),
      'hermes-agent', 'node_modules', 'acorn'),
    '/Users/YOURNAME/.hermes/hermes-agent/node_modules/acorn',
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) {}
  }
  console.error('acorn 不可用：npm install acorn 或核对 hermes-agent/node_modules 路径'); process.exit(3);
}
const acorn = loadAcorn();

// ---------- 手写 walker（acorn-walk 本机缺失） ----------
function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walk(c, visit));
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}

// ---------- 识别 ----------
const API_LIKE = /\/(api|apis|v\d+|graphql|gql|rest|svc|service|gateway)\b/i;
const URL_LIKE = /^\/[\w\-./:{}[\]]*(\/[\w\-./:{}[\]]+)+$/; // ≥2 级路径

function litValue(n) {
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral' && n.quasis.length === 1) return n.quasis[0].value.cooked;
  return null;
}
function staticString(n) { // Literal 或单 quasi 模板串的静态值
  return litValue(n);
}
function tmplInfo(n) { // 模板串：拼接 quasis + ${} 占位
  if (!n || n.type !== 'TemplateLiteral') return null;
  let s = '';
  for (let i = 0; i < n.quasis.length; i++) {
    s += n.quasis[i].value.cooked;
    if (i < n.expressions.length) s += '${}';
  }
  return s;
}
function calleeName(n) { // fetch / axios.get / a.b.c → 'a.b.c'（尽力）
  if (!n) return null;
  if (n.type === 'Identifier') return n.name;
  if (n.type === 'MemberExpression') {
    const p = calleeName(n.object);
    const prop = n.property.type === 'Identifier' ? n.property.name
      : (n.property.type === 'Literal' ? String(n.property.value) : null);
    return p ? `${p}.${prop}` : prop;
  }
  return null;
}
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
function methodFrom(cname, args) {
  if (!cname) return null;
  const last = cname.split('.').pop().toLowerCase();
  if (HTTP_METHODS.has(last)) return last.toUpperCase();
  if (/^(xhr|xmlhttprequest)$/i.test(cname) || /open$/i.test(last)) {
    // XMLHttpRequest.open(method, url, ...)
    const m = args[0] && args[0].type === 'Literal' ? String(args[0].value).toUpperCase() : null;
    return m || null;
  }
  if (/^(fetch|ajax|request|useRequest|useFetch)$/.test(last)) {
    // fetch(url, {method:'POST'}) — 第二参对象里找 method
    const opt = args[1];
    if (opt && opt.type === 'ObjectExpression') {
      for (const p of opt.properties) {
        if (p.key && p.key.name === 'method' && p.value.type === 'Literal')
          return String(p.value.value).toUpperCase();
      }
    }
    return 'GET';
  }
  return null;
}

// ---------- 收集 ----------
function extract(ast, file, out) {
  const addRoute = (raw, methods, params, data_keys, file) => {
    if (!raw) return;
    let p = raw.split('?')[0];
    if (!p || p === '/' || !URL_LIKE.test(p) && !API_LIKE.test(p)) return;
    // 查询串参数
    const q = raw.split('?')[1] || '';
    for (const m of q.matchAll(/([?&|^])([\w-]+)=/g)) params.add(m[2]);
    for (const m of p.matchAll(/\/\{([\w-]+)\}|\/:([\w-]+)|\$\{\}/g)) {
      const name = m[1] || m[2] || '${}';
      params.add(name); p = p.replace(m[0], '/' + (m[1] || m[2] || 'VAR'));
    }
    const key = p;
    const r = out.routes[key] || (out.routes[key] = { path: p, methods: new Set(), params: new Set(), data_keys: new Set(), files: new Set() });
    (methods || []).forEach(m => r.methods.add(m));
    params.forEach(x => r.params.add(x));
    data_keys.forEach(x => r.data_keys.add(x));
    r.files.add(file);
  };
  const objKeys = (n) => n && n.type === 'ObjectExpression'
    ? n.properties.filter(p => p.key).map(p => (p.key.name || p.key.value)).filter(x => typeof x === 'string')
    : [];
  const OPTION_KEYS = new Set(['method', 'headers', 'body', 'data', 'params', 'credentials',
    'signal', 'timeout', 'responseType', 'withCredentials', 'json', 'baseURL', 'url', 'auth', 'proxy']);
  // 从调用实参里挖请求体键：JSON.stringify(obj) 的 obj / body|data|params 属性值 / 非选项键的对象实参
  function collectDataKeys(argNode, dk) {
    if (!argNode) return;
    walk(argNode, n => {
      if (n.type === 'CallExpression') {
        const cn = calleeName(n.callee);
        if (cn && /stringify|serialize$/i.test(cn) && n.arguments[0])
          objKeys(n.arguments[0]).forEach(k => dk.add(k));
      }
      if (n.type === 'Property' && n.key && /^(body|data|params)$/.test(n.key.name || '')
        && n.value && n.value.type === 'ObjectExpression')
        objKeys(n.value).forEach(k => dk.add(k));
    });
    if (argNode.type === 'ObjectExpression')
      objKeys(argNode).filter(k => !OPTION_KEYS.has(k)).forEach(k => dk.add(k));
  }

  walk(ast, node => {
    // 1) 调用点：fetch/axios.x/$http/xhr.open —— 拿 path + method + data keys
    if (node.type === 'CallExpression') {
      const cname = calleeName(node.callee);
      const args = node.arguments;
      if (cname && /^(fetch|axios(\.[a-z]+)?|http(\.[a-z]+)?|\$http(\.[a-z]+)?|useRequest|useFetch)$/i.test(cname)
          || (cname && /open$/i.test(cname))) {
        const urlArg = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(methodFrom(cname, args) || '') && /open$/i.test(cname)
          ? args[1] : args[0];
        const raw = litValue(urlArg) || tmplInfo(urlArg);
        if (raw) {
          const params = new Set(), dk = new Set();
          const optArgs = /open$/i.test(cname) ? [] : args.slice(1);
          optArgs.forEach(a => collectDataKeys(a, dk));
          const m = methodFrom(cname, args);
          addRoute(raw, m ? [m] : [], params, dk, file);
        }
      }
    }
    // 2) 字符串字面量：路径形（含 /api/、/v1/x/y、REST 模板）兜底进路由表（methods 未知）
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const s = node.value;
      if ((API_LIKE.test(s) || URL_LIKE.test(s)) && s.length < 200 && !/^\/\//.test(s))
        addRoute(s, [], new Set(), new Set(), file);
    }
    // 3) GraphQL：query/mutation/subscription 操作字面量（含模板串形态）
    const gqlStr = staticString(node);
    if (gqlStr && gqlStr.length < 4000) {
      const m = gqlStr.match(/^\s*(query|mutation|subscription)\s+(\w+)/);
      if (m) {
        const op = m[2], type = m[1];
        const e = out.graphql[op] || (out.graphql[op] = { op, type, files: new Set() });
        e.files.add(file);
      }
    }
  });
}

// ---------- 入口 ----------
function run(paths, jsonOut) {
  const out = { routes: {}, graphql: {} };
  const files = [];
  const expand = p => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(p)) {
        if (!/\.js$|\.mjs$|\.cjs$|\.ts$/.test(f) || /\.min\./.test(f) === false || true) {
          const fp = path.join(p, f);
          const s2 = fs.statSync(fp);
          if (s2.isFile() && /\.(js|mjs|cjs|ts)$/.test(f)) files.push(fp);
          else if (s2.isDirectory()) expand(fp);
        }
      }
    } else files.push(p);
  };
  paths.forEach(expand);
  let parse_fail = 0;
  for (const f of files) {
    try {
      const code = fs.readFileSync(f, 'utf8');
      const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true, locations: true });
      extract(ast, path.basename(f), out);
    } catch (e) { parse_fail++; } // 压缩/带 JSX 的文件容错跳过，计数披露
  }
  const result = {
    generated_at: new Date().toISOString(),
    files_scanned: files.length, parse_failures: parse_fail,
    routes: Object.values(out.routes).map(r => ({
      path: r.path, methods: [...r.methods], params: [...r.params],
      data_keys: [...r.data_keys], files: [...r.files]
    })).sort((a, b) => a.path.localeCompare(b.path)),
    graphql: Object.values(out.graphql).map(g => ({ op: g.op, type: g.type, files: [...g.files] }))
  };
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2));
  // stdout 摘要
  console.log(`files_scanned=${result.files_scanned} parse_failures=${parse_fail} routes=${result.routes.length} graphql_ops=${result.graphql.length}`);
  for (const r of result.routes.slice(0, 200))
    console.log(`${(r.methods.join(',') || '?').padEnd(7)} ${r.path}${r.params.length ? '  params:' + r.params.join(',') : ''}${r.data_keys.length ? '  body:' + r.data_keys.join(',') : ''}`);
  for (const g of result.graphql.slice(0, 100))
    console.log(`GQL ${g.type.padEnd(12)} ${g.op}`);
  return result;
}

// ---------- 自测（零网络，fixture 内嵌） ----------
function selftest() {
  const fixture = `
fetch("/api/users?page=1&size=20");
fetch("/api/orders/detail", {method:"POST", body: JSON.stringify({orderId: 1, sign: "abc", ts: 123})});
axios.get("/v1/products/list?type=hot");
axios.post("/api/v1/cart/add", {skuId: 9, count: 2});
const xhr = new XMLHttpRequest(); xhr.open("GET", "/api/session/heartbeat", true);
const uid = 42; fetch(\`/api/users/\${uid}/orders?status=paid\`);
const q = \`  query GetUserProfile { user { id name email } }\`;
const m2 = \`mutation UpdateAddr { updateAddress(input:{id:1}) { ok } }\`;
localStorage.setItem("cb", "/callback/finish");
`;
  const out = { routes: {}, graphql: {} };
  const ast = acorn.parse(fixture, { ecmaVersion: 'latest' });
  extract(ast, 'fixture.js', out);
  const routes = Object.values(out.routes).map(r => r.path);
  const gql = Object.values(out.graphql).map(g => g.op);
  const expectRoutes = ['/api/users', '/api/orders/detail', '/v1/products/list', '/api/v1/cart/add',
    '/api/session/heartbeat', '/api/users/${uid}/orders', '/callback/finish'];
  const missing = expectRoutes.filter(e => !routes.some(r => r.includes(e.split('?')[0].replace('${uid}', '${}')) || r === e || r.includes(e.split('?')[0].split('${')[0])));
  const gqlMissing = ['GetUserProfile', 'UpdateAddr'].filter(e => !gql.includes(e));
  // body keys 断言：/api/orders/detail 应带 orderId/sign/ts
  const detail = Object.values(out.routes).find(r => r.path === '/api/orders/detail');
  const bodyOk = detail && detail.data_keys.has('sign') && detail.data_keys.has('ts');
  console.log(`selftest routes=${routes.length} graphql=${gql.length} missing=${JSON.stringify(missing)} gql_missing=${JSON.stringify(gqlMissing)} body_keys_ok=${bodyOk}`);
  if (missing.length || gqlMissing.length || !bodyOk) { console.error('SELFTEST FAIL'); process.exit(1); }
  console.log('SELFTEST PASS extract_routes.js');
}

const args = process.argv.slice(2);
if (args[0] === '--selftest') { selftest(); process.exit(0); }
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args.splice(jsonIdx, 2)[1] : null;
const paths = args.filter(a => !a.startsWith('--'));
if (!paths.length) { console.error('usage: node extract_routes.js <file|dir>... [--json out.json] | --selftest'); process.exit(2); }
run(paths, jsonOut);
