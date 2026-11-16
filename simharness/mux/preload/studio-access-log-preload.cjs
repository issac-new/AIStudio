'use strict';
// studio-access-log-preload.cjs — 8802 请求级遥测（G-004-part，kanban t_4d59c9d0，
// drill-20261114-gateway 演练后改进②）
//
// 背景：r004 取证实证 8802 对 401/请求级动作应用层零痕迹（server.log 只记应用
// 事件、DB 无请求日志、gw-err 只记错误）。hermes-studio vendor dist 无 HTTP 访问
// 日志开关（grep morgan/pino-http/accessLog 零命中，requestLog 5 处均为 LLM 客户端
// 日志）——故沿 S-L2 加固（t_8d68f11e）的 node -r 预加载机制扩展本文件。
//
// 机制：monkey-patch node 核心 http.Server.prototype.emit——任何框架
// （express/fastify/裸 http）创建的 server 都继承该 prototype，'request' 与
// 'upgrade'（websocket）两事件均在 dispatch 前 intercept；http.Server 亦被
// https.Server 继承（若未来升 TLS 同样覆盖）。启动序：node -r 先于 dist/index.js
// 执行，hook 必然先于 server 创建就位。
//
// 落盘：JSON 行（JSONL），默认 <SIM_ROOT>/logs/studio-access.log（由本文件位置
// 推导 __dirname/../logs/），可用 STUDIO_ACCESS_LOG 覆盖。轮转：启动时 + 每 2048
// 行检查一次，>20MiB 时 rename 为 .1（单代覆盖，防日志洪水撑盘）。
//
// 字段（一行一请求）：
//   ts          ISO8601 UTC 毫秒
//   method      HTTP 方法（upgrade 记 "GET"+status 101）
//   path        仅 pathname——query 整体剥离（fallback auth URL 可能携 token 于
//               query，宁可少记不泄密），只记 has_query 布尔；长度截 512
//   has_query   bool
//   status      响应码；客户端中途断开（close 未 finish）记 499（nginx 惯例）
//   dur_ms      request-in → finish/close 耗时
//   auth        派生字段：401/403→"rejected"，2xx/3xx→"ok"，其余→"unclear"
//               （404/5xx 无法从状态码区分认证前后，不冒充事实）
//   auth_hdr    {present, scheme}——仅记 Authorization 头是否存在 + 方案名
//               （"Bearer" 等首词，≤16 字符），绝不记头值/token 全文
//   raddr       客户端 IP（剥 ::ffff: 前缀），非凭据；供绑定面评估观测 LAN 访问
//
// 红线：不记任何 header 值、query string、body、token、cookie。
// fail-open：遥测组件故障（目录不可建/写失败/hook 异常）一律 console.error 后
// 降级继续，绝不 exit——与 jwt-secret-preload.cjs 的 fail-closed（exit 78）刻意
// 相反：密钥缺失=安全回归必须拒启，遥测缺失=观测退化服务照常。
(() => {
  const fs = require('fs');
  const path = require('path');

  const LOG_PATH = process.env.STUDIO_ACCESS_LOG ||
    path.resolve(__dirname, '..', 'logs', 'studio-access.log');
  const ROTATE_BYTES = 20 * 1024 * 1024;   // 20 MiB
  const ROTATE_CHECK_EVERY = 2048;         // 每 N 行 stat 一次
  let writeCount = 0;
  let disabled = false;

  function logErr(msg) {
    try { console.error('[studio-access-log] ' + msg); } catch (_) {}
  }

  // ── 启动准备：目录 + 首轮轮转 ─────────────────────────────
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    rotateIfNeeded(true);
  } catch (e) {
    disabled = true;
    logErr('FATAL: access log unavailable (' + (e && e.code || e) + ') at ' +
      LOG_PATH + ' — telemetry DISABLED, service continues (fail-open)');
    return;
  }

  function rotateIfNeeded(force) {
    try {
      const st = fs.statSync(LOG_PATH);
      if (st.size > ROTATE_BYTES) {
        fs.renameSync(LOG_PATH, LOG_PATH + '.1'); // 单代覆盖
      }
    } catch (_) {
      // 首次运行文件不存在——无需轮转
    }
  }

  function writeLine(obj) {
    if (disabled) return;
    try {
      fs.appendFileSync(LOG_PATH, JSON.stringify(obj) + '\n');
      if (++writeCount % ROTATE_CHECK_EVERY === 0) rotateIfNeeded();
    } catch (e) {
      disabled = true; // 连续写失败则静默停用，避免每请求刷屏
      logErr('append failed (' + (e && e.code || e) + ') — telemetry DISABLED (fail-open)');
    }
  }

  // ── 请求观测 ─────────────────────────────────────────────
  function authOutcome(status) {
    if (status === 401 || status === 403) return 'rejected';
    if (status >= 200 && status < 400) return 'ok';
    return 'unclear';
  }

  function sanitizeUrl(rawUrl) {
    // pathname-only：query 可能携带 fallback 登录 token，整体丢弃只留布尔
    try {
      const u = new URL(rawUrl, 'http://studio.local');
      return { p: u.pathname.slice(0, 512), q: u.search.length > 0 };
    } catch (_) {
      const s = String(rawUrl || '');
      const qi = s.indexOf('?');
      return {
        p: (qi >= 0 ? s.slice(0, qi) : s).slice(0, 512),
        q: qi >= 0,
      };
    }
  }

  function observe(req, responder, isUpgrade) {
    const t0 = process.hrtime.bigint();
    const { p, q } = sanitizeUrl(req.url);
    const h = req.headers || {};
    const authz = h['authorization'];
    const present = typeof authz === 'string' && authz.length > 0;
    const scheme = present ? String(authz.split(' ', 1)[0]).slice(0, 16) : null;
    const raddr = String((req.socket && req.socket.remoteAddress) || '')
      .replace(/^::ffff:/, '');
    const method = String(req.method || '?');

    let logged = false;
    const done = (status) => {
      if (logged) return;
      logged = true;
      const durMs = Number(process.hrtime.bigint() - t0) / 1e6;
      writeLine({
        ts: new Date().toISOString(),
        method: method,
        path: p,
        has_query: q,
        status: status,
        dur_ms: Math.round(durMs * 10) / 10,
        auth: authOutcome(status),
        auth_hdr: { present: present, scheme: scheme },
        raddr: raddr,
        pid: process.pid,
      });
    };

    if (isUpgrade) {
      // upgrade: responder 是 socket；握手回 101，断开时记行
      responder.once('close', () => done(101));
      return;
    }
    responder.once('finish', () => done(responder.statusCode));
    responder.once('close', () => done(responder.statusCode || 499));
  }

  // ── hook 安装（先于 dist/index.js 任何 createServer）─────────
  const http = require('http');
  const origEmit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (ev, req, responder) {
    if ((ev === 'request' || ev === 'upgrade') && req && req.url !== undefined) {
      try { observe(req, responder, ev === 'upgrade'); } catch (_) {}
    }
    return origEmit.apply(this, arguments);
  };

  logErr('access log armed → ' + LOG_PATH);
})();

// ---------------------------------------------------------------------------
// 2026-11-16 绑定收敛（drill 后 P2，用户裁决「收敛8802」）：BIND_HOST ||= 127.0.0.1
// dist 源码实证：Nri() = process.env.BIND_HOST?.trim() || "0.0.0.0"（主 listen host）。
// 曾长期 *:8802 全接口暴露（r001 靶标快照）；LAN 访问需求经 ops 评估为无（t_4d59c9d0）。
// 恢复外绑须先过 hack 板演练复测（锚卡 t_8e1d6246 注记链）。
if (!process.env.BIND_HOST || !process.env.BIND_HOST.trim()) {
  process.env.BIND_HOST = '127.0.0.1';
}
