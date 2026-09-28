// overlay/scripts/aipay/mux/mx-grant-profiles.mjs
// 全家族 profile 授权种子（2026-09-28 产品实操演示轮修复落盘）。
// 根因：studio 的看板可见性按 user_profiles 授权表过滤（非 super_admin 一律
// 过滤）——15 人 matrix 账号每人只有 1 条默认档授权，而卡的 assignee 是
// agent 档（fanfan-sys-analyst 等）→ 列表全空 + 跨板 getTask 404 → IDE 任务
// 简报抽屉点亮失败。V3 轮的同款"studio 家族授权缺失（28 条）数据修复"在
// DB 重建后丢失，本脚本使其可复现。
// 用法：node scripts/aipay/mux/mx-grant-profiles.mjs   （在 overlay 目录跑）
import { DatabaseSync } from 'node:sqlite';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';

const SIM_ROOT = process.env.AIPAY_SIM_ROOT || '/Volumes/nvme2230/lab/ncwk-sim-mux';
const DB = join(SIM_ROOT, 'webui', 'hermes-web-ui.db');
const HB = process.env.HERMES_BIN || join(homedir(), '.hermes/hermes-agent/venv/bin/hermes');

const db = new DatabaseSync(DB);
const users = db.prepare('SELECT id, username FROM users').all();

// 授权档全集：14 人类档 + 其 -agent 档 + 板上真实 assignee 档（从计划板采集）
const set = new Set(['default']);
for (const u of ['admin','bella','fanfan','wei','mei','chen','hu','lin','xiao','qi','fei','arch','secops','ops']) {
  set.add(u); set.add(u + '-agent');
}
try {
  const out = execSync(
    `HERMES_HOME="${join(SIM_ROOT, 'hermes')}" "${HB}" kanban --board fanfan-pm-plan list --json`,
    { maxBuffer: 1e8 },
  ).toString();
  for (const t of JSON.parse(out)) { if (t.assignee) set.add(t.assignee); }
} catch (e) {
  console.warn('[mx-grant-profiles] 计划板采集失败（仅种子基础档）:', e.message);
}
const profiles = [...set].sort();

const stmt = db.prepare(
  'INSERT OR IGNORE INTO user_profiles (user_id, profile_name, is_default, created_at) VALUES (?, ?, 0, ?)',
);
let added = 0;
for (const u of users) {
  for (const p of profiles) added += stmt.run(u.id, p, Date.now()).changes;
}
console.log(`[mx-grant-profiles] users=${users.length} profiles=${profiles.length} 新增授权=${added}`);
