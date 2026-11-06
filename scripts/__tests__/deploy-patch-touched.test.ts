import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deriveAgentPatchTouchedFiles, touchedFilesFromPatchText } from '../platform/deploy/patch-touched.mjs';

// N-1 守门（spec 2026-11-06-runtime-patch-touched-deploy）：补丁触碰面派生——
// manifest 只收补丁新增文件的历史缺口由本派生根治，破坏派生＝接线再次只靠手工同步。

describe('touchedFilesFromPatchText 纯解析三形态', () => {
  it('修改/新增文件取 b 侧路径', () => {
    const t = touchedFilesFromPatchText(
      'diff --git a/agent/x.py b/agent/x.py\n--- a/agent/x.py\n+++ b/agent/x.py\n@@ -1 +1 @@\n-a\n+b\n');
    expect([...t.files]).toEqual(['agent/x.py']);
    expect(t.deleted.size).toBe(0);
  });
  it('新文件（a 侧 /dev/null）仍取 b 侧真实路径', () => {
    const t = touchedFilesFromPatchText(
      'diff --git a/tools/new.py b/tools/new.py\nnew file mode 100644\n--- /dev/null\n+++ b/tools/new.py\n@@ -0,0 +1 @@\n+x\n');
    expect([...t.files]).toEqual(['tools/new.py']);
  });
  it('删除文件（b 侧 /dev/null）入 deleted 不入 files', () => {
    const t = touchedFilesFromPatchText(
      'diff --git a/gone.py b/gone.py\ndeleted file mode 100644\n--- a/gone.py\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n');
    expect(t.files.size).toBe(0);
    expect([...t.deleted]).toEqual(['gone.py']);
  });
});

describe('deriveAgentPatchTouchedFiles 夹具树', () => {
  const dir = join(tmpdir(), `pt-derive-${Date.now()}`);
  mkdirSync(join(dir), { recursive: true });
  const mkPatch = (name: string, body: string) => writeFileSync(join(dir, name), body);
  mkPatch('010-agent-mod.patch', 'diff --git a/agent/a.py b/agent/a.py\n--- a/agent/a.py\n+++ b/agent/a.py\n@@ -1 +1 @@\n-a\n+b\n');
  mkPatch('011-agent-new.patch', 'diff --git a/agent/n.py b/agent/n.py\nnew file mode 100644\n--- /dev/null\n+++ b/agent/n.py\n@@ -0,0 +1 @@\n+x\n');
  mkPatch('012-agent-del.patch', 'diff --git a/agent/old.py b/agent/old.py\ndeleted file mode 100644\n--- a/agent/old.py\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n');
  // studio 前缀（packages/）：不路由 agent，不入派生集
  mkPatch('013-server-x.patch', 'diff --git a/packages/server/src/x.ts b/packages/server/src/x.ts\n--- a/packages/server/src/x.ts\n+++ b/packages/server/src/x.ts\n@@ -1 +1 @@\n-a\n+b\n');
  const series = '010-agent-mod.patch\n# 注释行跳过\n011-agent-new.patch\n012-agent-del.patch\n013-server-x.patch\n';

  it('agent 面三形态齐备、studio 面排除、注释跳过', () => {
    const r = deriveAgentPatchTouchedFiles(dir, series);
    expect(r.agentPatches).toBe(3);
    expect(r.studioPatches).toBe(1);
    expect(r.files.has('agent/a.py')).toBe(true);
    expect(r.files.has('agent/n.py')).toBe(true);
    expect(r.files.has('agent/old.py')).toBe(false);   // 删除态不参与同步
    expect(r.deleted.has('agent/old.py')).toBe(true);
    expect([...r.files].some((f) => f.startsWith('packages/'))).toBe(false);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
});

describe('真仓断言（patches/ 实链）', () => {
  const repoRoot = join(import.meta.dirname, '..', '..');
  const patchDir = join(repoRoot, 'patches');
  const derived = deriveAgentPatchTouchedFiles(patchDir, readFileSync(join(patchDir, 'series'), 'utf8'));

  it('601 接线与 470 锚点在派生集内（N-1 缺口的正身文件）', () => {
    expect(derived.files.has('agent/agent_init.py')).toBe(true);       // 601 修改类接线
    expect(derived.files.has('gateway/hosted_rooms.py')).toBe(true);   // 470 collab_event_id
    expect(derived.files.has('agent/runaway_guard.py')).toBe(true);    // 401/759
  });
  it('已退役 742 不在 series（其内容已被上游吸收，不产生派生）', () => {
    expect(readFileSync(join(patchDir, 'series'), 'utf8')).not.toMatch(/^742-agent-v0227-runtime-resync\.patch$/m);
  });
  it('派生规模与 agent 补丁计数量级守门（防系列性路由回归清空派生）', () => {
    expect(derived.agentPatches).toBeGreaterThanOrEqual(90);
    expect(derived.files.size).toBeGreaterThan(100);
  });
});

describe('deploy 器接线源码级断言', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'deploy-agent-runtime.mjs'), 'utf8');
  it('import 派生库且主循环消费（防静默摘除）', () => {
    expect(src).toContain("from './platform/deploy/patch-touched.mjs'");
    expect(src).toContain('deriveAgentPatchTouchedFiles(patchesDir');
  });
  it('隔离面（RUNTIME_DEPLOY_MANIFEST）不启用派生＋manifest 可显式关断', () => {
    expect(src).toContain('!process.env.RUNTIME_DEPLOY_MANIFEST');
    expect(src).toContain('manifest.agentPatchSync !== false');
  });
  it('触碰面收口不触发 partial（防 inject 部署预检死锁回归）', () => {
    expect(src).not.toContain('deployPartial = kept > 0 || conflict > 0 || touchedConverge');
  });
});
