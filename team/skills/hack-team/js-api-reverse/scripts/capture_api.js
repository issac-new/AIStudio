#!/usr/bin/env node
/**
 * capture_api.js — playwright 抓包 + 签名入口 hook 模板（mitmproxy/reqable/burp 缺失时的降级路径）
 *
 * 来源：融合 W2-A（模式参考 S3 reverse-skill skills/js-reverse 的 jshook 执行面，按模式自写，禁 vendor 正文）
 * 依赖：node + playwright 模块 + 系统 Google Chrome（channel:'chrome'；默认 chromium 二进制本机未装，2026-11-02 实证）
 *
 * 两个能力：
 *   1) 抓包：request/response 全量落 JSONL（url/method/req_headers/req_body/status/resp_body）
 *   2) hook：页面侧包 fetch/XHR/sendBeacon，在「请求构建时刻」取 new Error().stack —— 调用栈直接指向
 *      拼 sign/token 的前端函数（file:line），是 jshook 类 MCP 的零依赖替代
 *
 * 用法：
 *   node capture_api.js <url> [--out out.jsonl] [--stay-ms 8000] [--extra-hook hook.js]
 *   node capture_api.js --selftest      # 零网络自测（page.route 本地拦截回环），exit=0 才可用
 */
'use strict';
const fs = require('fs');
const path = require('path');
function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  const candidates = [
    path.join(process.env.HERMES_HOME || path.join(require('os').homedir(), '.hermes'),
      'hermes-agent', 'node_modules', 'playwright'),
    '/Users/YOURNAME/.hermes/hermes-agent/node_modules/playwright',
  ];
  for (const c of candidates) { try { return require(c); } catch (e) {} }
  console.error('playwright 不可用：核对 hermes-agent/node_modules'); process.exit(3);
}
const { chromium } = loadPlaywright();

// ---------- 页面侧 hook（addInitScript 注入，跨导航存活走 console 通道） ----------
const HOOK_SRC = `
(function(){
  const CAP = (kind, data) => { try { console.log('__CAP__' + JSON.stringify(Object.assign({ts: Date.now(), kind}, data))); } catch(e){} };
  const str = (b) => { if (b == null) return null; if (typeof b === 'string') return b; try { return JSON.stringify(b); } catch(e){ return String(b); } };
  const of = window.fetch;
  if (of) window.fetch = function(input, init){
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const m = (init && init.method) || (input && input.method) || 'GET';
      CAP('fetch', {url: String(url), method: String(m).toUpperCase(), body: str(init && init.body), stack: (new Error()).stack});
    } catch(e){}
    return of.apply(this, arguments);
  };
  const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u){ this.__cap = {method: String(m).toUpperCase(), url: String(u)}; return oo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(b){
    try { CAP('xhr', Object.assign({}, this.__cap || {}, {body: str(b), stack: (new Error()).stack})); } catch(e){}
    return os.apply(this, arguments);
  };
  if (navigator.sendBeacon) {
    const ob = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(u, d){ CAP('beacon', {url: String(u), body: str(d), stack: (new Error()).stack}); return ob(u, d); };
  }
})();`;

// ---------- 主流程 ----------
async function runCapture(url, out, stayMs, extraHook) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  await ctx.addInitScript(HOOK_SRC + (extraHook ? '\n' + fs.readFileSync(extraHook, 'utf8') : ''));
  const page = await ctx.newPage();
  const hookCaps = [];          // console 通道回传的 hook 记录（含调用栈）
  const reqs = new Map();       // request -> record

  page.on('console', msg => {
    const t = msg.text();
    if (t.startsWith('__CAP__')) { try { hookCaps.push(JSON.parse(t.slice(7))); } catch (e) {} }
  });
  page.on('request', r => {
    reqs.set(r, { ts: Date.now(), url: r.url(), method: r.method(),
      req_headers: r.headers(), req_body: r.postData() || null, status: null, resp_body: null });
  });
  page.on('response', async resp => {
    const rec = reqs.get(resp.request()); if (!rec) return;
    rec.status = resp.status();
    try { rec.resp_body = (await resp.text()).slice(0, 2048); } catch (e) { rec.resp_body = null; }
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => console.error('goto:', e.message));
  await page.waitForTimeout(stayMs);
  // hook 记录与请求记录按 url+method+时间邻近合并，附上签名入口调用栈
  const records = [...reqs.values()].map(r => {
    const path = (() => { try { return new URL(r.url).pathname + new URL(r.url).search; } catch (e) { return r.url; } })();
    const cap = hookCaps.filter(c => c.url && (c.url === path || c.url.includes(path) || path.includes(c.url.split('?')[0]))
      && (!c.method || c.method === r.method) && Math.abs((c.ts || 0) - r.ts) < 5000)
      .sort((a, b) => Math.abs(a.ts - r.ts) - Math.abs(b.ts - r.ts))[0];
    return { ...r, hook_stack: cap ? cap.stack : null, hook_body: cap ? cap.body : null };
  });
  await browser.close();
  const lines = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(out, lines);
  console.error(`captured requests=${records.length} hook_caps=${hookCaps.length} with_stack=${records.filter(r => r.hook_stack).length} -> ${out}`);
  return { records, hookCaps };
}

// ---------- 自测（零网络：page.route 本地拦截回环） ----------
async function selftest() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext();
  await ctx.addInitScript(HOOK_SRC);   // 必须先注册后 newPage：context 级 init 只对之后创建的页面生效（本机实证）
  const page = await ctx.newPage();
  await page.route('**/selftest/api*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  const hookCaps = [];
  page.on('console', msg => {
    const t = msg.text();
    if (t.startsWith('__CAP__')) { try { hookCaps.push(JSON.parse(t.slice(7))); } catch (e) {} }
  });
  let reqSeen = 0, respStatus = null;
  page.on('request', r => { if (r.url().includes('/selftest/api')) reqSeen++; });
  page.on('response', r => { if (r.url().includes('/selftest/api')) respStatus = r.status(); });
  await page.setContent(`<script>
    // 绝对 URL：about:blank 基址解析不了相对路径；selftest.local 由 page.route 本地拦截，零网络
    fetch('http://selftest.local/selftest/api?x=1', {method:'POST', body: JSON.stringify({sign:'abc', ts: 123})});
    const x = new XMLHttpRequest(); x.open('GET', 'http://selftest.local/selftest/api/list'); x.send();
  </script>`);
  await page.waitForTimeout(1500);
  await browser.close();
  const fetchCap = hookCaps.find(c => c.kind === 'fetch' && c.url.includes('/selftest/api'));
  const xhrCap = hookCaps.find(c => c.kind === 'xhr' && (c.url || '').includes('/selftest/api/list'));
  const ok = reqSeen >= 2 && respStatus === 200 && fetchCap && xhrCap
    && typeof fetchCap.stack === 'string' && fetchCap.stack.length > 0
    && fetchCap.body && fetchCap.body.includes('sign');
  console.log(`selftest req=${reqSeen} status=${respStatus} fetch_cap=${!!fetchCap} xhr_cap=${!!xhrCap} stack_len=${fetchCap ? fetchCap.stack.length : 0} body_has_sign=${!!(fetchCap && fetchCap.body && fetchCap.body.includes('sign'))}`);
  if (!ok) { console.error('SELFTEST FAIL'); process.exit(1); }
  console.log('SELFTEST PASS capture_api.js');
}

const args = process.argv.slice(2);
if (args[0] === '--selftest') { selftest().catch(e => { console.error('SELFTEST ERROR', e.message); process.exit(1); }); }
else {
  const url = args.find(a => !a.startsWith('--'));
  if (!url) { console.error('usage: node capture_api.js <url> [--out out.jsonl] [--stay-ms N] [--extra-hook h.js] | --selftest'); process.exit(2); }
  const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  runCapture(url, flag('--out', 'capture.jsonl'), parseInt(flag('--stay-ms', '8000'), 10), flag('--extra-hook', null))
    .catch(e => { console.error('CAPTURE ERROR', e.message); process.exit(1); });
}
