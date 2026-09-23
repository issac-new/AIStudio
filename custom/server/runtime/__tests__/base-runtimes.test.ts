// 基础运行时层守门测试(semantica MCP 清单 + pua vendored 技能 + 接线一致性)。
// 设计依据:docs/superpowers/specs/2026-09-23-base-runtimes-design.md
// 覆盖:inject patch 路由(runtime 目录前缀)、manifest/PIN schema、单一事实源
// ↔patch 375 逐字节一致、vendor/注册纯函数(免网络免 HOME)。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const overlayRoot = resolve(__dirname, '..', '..', '..', '..');
const runtimeRoot = resolve(overlayRoot, 'runtime');
const puaRoot = resolve(runtimeRoot, 'pua');

// 直跑守卫保证 import 无副作用(见各脚本尾部)。
import { resolvePatchTargetRoot } from '../../../../scripts/inject.mjs';
import { validateSkillsShape, buildPinYaml, syncFromSource, readPin, readPinSkills, readPinNormalized, normalizeSkillMd } from '../../../../scripts/runtime/vendor-pua.mjs';
import { applyPuaRegistration, semanticaMcpStatus } from '../../../../scripts/runtime/register-runtime.mjs';
import { extractNewFileContent, validateSemanticaManifest, validatePin, seriesListsPatch } from '../../../../scripts/runtime/runtime-doctor.mjs';

const hermesAgentRoot = resolve(overlayRoot, '..', 'upstream', 'hermes-agent');
const hermesStudioRoot = resolve(overlayRoot, '..', 'upstream', 'hermes-studio');

describe('inject patch 路由:基础运行时前缀', () => {
  const newFilePatch = (path: string) => `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+x\n`;
  const modifyPatch = (path: string) => `--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-x\n+y\n`;

  it('optional-mcps/ 与 optional-skills/ 路由到 hermes-agent(新文件与改文件两种形态)', () => {
    expect(resolvePatchTargetRoot(newFilePatch('optional-mcps/semantica/manifest.yaml'))).toBe(hermesAgentRoot);
    expect(resolvePatchTargetRoot(modifyPatch('optional-skills/foo/SKILL.md'))).toBe(hermesAgentRoot);
  });

  it('既有 hermes-agent 前缀保持路由不变(回归)', () => {
    for (const p of ['hermes_cli/x.py', 'plugins/y/z.py', 'agent/a.py', 'apps/b', 'assets/c', 'acp_d', 'gateway/e.py', 'tests/gateway/f', 'tests/hermes_cli/g']) {
      expect(resolvePatchTargetRoot(modifyPatch(p))).toBe(hermesAgentRoot, `前缀 ${p}`);
    }
  });

  it('hermes-studio 路径与 tests/ 其余子树仍落 studio(禁止整段路由回归)', () => {
    for (const p of ['packages/client/src/main.ts', 'vite.config.ts', 'package.json', 'tests/cockpit/foo.test.ts']) {
      expect(resolvePatchTargetRoot(modifyPatch(p))).toBe(hermesStudioRoot, `路径 ${p}`);
    }
  });

  it('无目标行的 patch 文本默认 studio(与历史行为一致)', () => {
    expect(resolvePatchTargetRoot('不是 patch 的文本')).toBe(hermesStudioRoot);
  });
});

describe('semantica MCP manifest schema(单一事实源守门)', () => {
  const manifestPath = resolve(runtimeRoot, 'semantica', 'manifest.yaml');
  const manifestText = readFileSync(manifestPath, 'utf8');

  it('当前 manifest 过 schema', () => {
    const [ok, problems] = validateSemanticaManifest(manifestText);
    expect(problems).toEqual([]);
    expect(ok).toBe(true);
  });

  it('浮动 ref(main)被拒绝', () => {
    const bad = manifestText.replace('ref: v0.7.0', 'ref: main');
    const [ok, problems] = validateSemanticaManifest(bad);
    expect(ok).toBe(false);
    expect(problems.join(';')).toMatch(/不得浮动/);
  });

  it('缺 ${INSTALL_DIR} 的 git 安装型 transport 被拒绝', () => {
    const bad = manifestText.replace('${INSTALL_DIR}/.venv/bin/semantica-mcp', '/usr/local/bin/semantica-mcp');
    const [, problems] = validateSemanticaManifest(bad);
    expect(problems.join(';')).toMatch(/INSTALL_DIR/);
  });
});

describe('单一事实源 ↔ patch 375 一致性', () => {
  const patchPath = resolve(overlayRoot, 'patches', '375-runtime-semantica-mcp-catalog.patch');

  it('patch 内嵌 manifest 与 runtime/semantica/manifest.yaml 逐字节一致', () => {
    const embedded = extractNewFileContent(readFileSync(patchPath, 'utf8'));
    expect(embedded).toBe(readFileSync(resolve(runtimeRoot, 'semantica', 'manifest.yaml'), 'utf8'));
  });

  it('series 已登记 375(注释行不算)', () => {
    const series = readFileSync(resolve(overlayRoot, 'patches', 'series'), 'utf8');
    expect(seriesListsPatch(series, '375-runtime-semantica-mcp-catalog.patch')).toBe(true);
    expect(seriesListsPatch('# 375-runtime-semantica-mcp-catalog.patch\n其他', '375-runtime-semantica-mcp-catalog.patch')).toBe(false);
  });

  it('extractNewFileContent 处理无尾换行标记', () => {
    const patch = '--- /dev/null\n+++ b/x\n@@ -0,0 +1 @@\n+abc\n\\ No newline at end of file\n';
    expect(extractNewFileContent(patch)).toBe('abc');
  });
});

describe('pua PIN 与 vendored 技能对账', () => {
  const pinPath = resolve(puaRoot, 'PIN.yaml');
  const pinText = readFileSync(pinPath, 'utf8');

  it('当前 PIN 过 schema', () => {
    const [ok, problems] = validatePin(pinText);
    expect(problems).toEqual([]);
    expect(ok).toBe(true);
  });

  it('skill_count 与清单不一致被拒绝', () => {
    const bad = pinText.replace('skill_count: 12', 'skill_count: 11');
    const [ok] = validatePin(bad);
    expect(ok).toBe(false);
  });

  it('skills 目录与 PIN 清单一一对应且各有 SKILL.md', () => {
    const pin = readPin();
    expect(pin).not.toBeNull();
    const skillsDir = resolve(puaRoot, 'skills');
    const actual = readdirSync(skillsDir).sort();
    expect(actual).toEqual([...pin!.skills].sort());
    for (const s of actual) expect(existsSync(resolve(skillsDir, s, 'SKILL.md')), s).toBe(true);
  });

  it('上游 pin 为 40 位不可变 commit(拒绝浮动)', () => {
    const pin = readPin();
    expect(pin!.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('YAML1.1 布尔裸值规范化:yes 技能 frontmatter name 加引号(2026-09-23 实弹缺陷)', () => {
    // 根因:hermes(pyyaml/YAML1.1)把裸 `name: yes` 读成布尔 True,扫描静默跳过。
    const bad = '---\nname: yes\ndescription: d\nlicense: MIT\n---\n正文\n';
    const { text, changed } = normalizeSkillMd(bad);
    expect(changed).toBe(true);
    expect(text).toContain('name: "yes"');
    // 已引号/正常名/无 frontmatter 不动
    expect(normalizeSkillMd('---\nname: "yes"\n---\nx').changed).toBe(false);
    expect(normalizeSkillMd('---\nname: pua\n---\nx').changed).toBe(false);
    expect(normalizeSkillMd('没有 frontmatter 的文本').changed).toBe(false);
  });

  it('readPin 分段解析:normalized 与 skills 不串段', () => {
    const raw = [
      'runtime: pua', 'ref: main', 'commit: ' + 'a'.repeat(40), 'skill_count: 2',
      'normalized:', '  - yes', 'skills:', '  - alpha', '  - yes', '',
    ].join('\n');
    expect(readPinNormalized(raw)).toEqual(['yes']);
    expect(readPinSkills(raw)).toEqual(['alpha', 'yes']);
  });

  it('当前 vendored:yes 已规范化且 PIN 记录在案', () => {
    const pin = readPin();
    expect(pin!.normalized).toContain('yes');
    expect(readFileSync(resolve(puaRoot, 'skills/yes/SKILL.md'), 'utf8')).toMatch(/name: "yes"/);
  });
});

describe('vendor 纯函数(fixture 驱动,免网络)', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(resolve(tmpdir(), 'pua-vendor-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  const makeSource = () => {
    const src = resolve(tmp, 'src');
    mkdirSync(resolve(src, 'skills/alpha'), { recursive: true });
    mkdirSync(resolve(src, 'skills/beta'), { recursive: true });
    writeFileSync(resolve(src, 'skills/alpha/SKILL.md'), '---\nname: alpha\n---\nA\n');
    writeFileSync(resolve(src, 'skills/beta/SKILL.md'), '---\nname: beta\n---\nB\n');
    writeFileSync(resolve(src, 'README.md'), 'x');
    return src;
  };

  it('validateSkillsShape:缺 SKILL.md 的技能目录被拒', () => {
    const src = makeSource();
    mkdirSync(resolve(src, 'skills/gamma'));
    expect(() => validateSkillsShape(resolve(src, 'skills'))).toThrow(/SKILL.md/);
  });

  it('syncFromSource:全量重建 + PIN/ATTRIBUTION 落盘 + 幂等重放一致', () => {
    const src = makeSource();
    const dest = resolve(tmp, 'dest');
    mkdirSync(dest, { recursive: true });
    const r1 = syncFromSource(src, dest, { ref: 'main', commit: 'a'.repeat(40), refDate: '2026-09-09T18:27:33+08:00', vendoredAt: '2026-09-23T00:00:00Z' });
    expect(r1.skillNames).toEqual(['alpha', 'beta']);
    expect(existsSync(resolve(dest, 'PIN.yaml'))).toBe(true);
    expect(readFileSync(resolve(dest, 'PIN.yaml'), 'utf8')).toMatch(/commit: a{40}/);
    expect(readFileSync(resolve(dest, 'ATTRIBUTION.md'), 'utf8')).toMatch(/MIT/);

    // 冗余文件被下次同步清掉(全量重建语义)。
    mkdirSync(resolve(dest, 'skills/rogue'));
    syncFromSource(src, dest, { ref: 'main', commit: 'a'.repeat(40), refDate: 'x', vendoredAt: 'y' });
    expect(existsSync(resolve(dest, 'skills/rogue'))).toBe(false);
  });

  it('buildPinYaml:必填缺失抛错', () => {
    expect(() => buildPinYaml({ repository: '', ref: 'main', commit: 'a'.repeat(40), refDate: 'x', skillNames: ['a'], vendoredAt: 'y' })).toThrow();
  });
});

describe('profile 注册纯函数(免 HOME)', () => {
  it('无既有 config → 生成含 external_dirs 的最小配置', () => {
    const r = applyPuaRegistration(null, '/abs/pua/skills');
    expect(r.changed).toBe(true);
    const doc = r.nextText!;
    expect(doc).toMatch(/external_dirs:/);
    expect(doc).toMatch(/\/abs\/pua\/skills/);
  });

  it('幂等:重复注册不再变更;既有注释保留', () => {
    const base = [
      '# 顶部注释:勿丢',
      'model: some-model',
      'skills:',
      '  creation_nudge_interval: 15',
      '  external_dirs:',
      '    - ~/.agents/skills',
    ].join('\n') + '\n';
    const r1 = applyPuaRegistration(base, '/abs/pua/skills');
    expect(r1.changed).toBe(true);
    expect(r1.nextText).toContain('# 顶部注释:勿丢');
    expect(r1.nextText).toContain('- ~/.agents/skills');
    const r2 = applyPuaRegistration(r1.nextText!, '/abs/pua/skills');
    expect(r2.changed).toBe(false);
    expect(r2.alreadyRegistered).toBe(true);
  });

  it('skills 非映射/external_dirs 非列表 → 拒绝改写不抛脏数据', () => {
    expect(() => applyPuaRegistration('skills: 42\n', '/x')).toThrow(/不是映射/);
    expect(() => applyPuaRegistration('skills:\n  external_dirs: str\n', '/x')).toThrow(/不是列表/);
  });

  it('semanticaMcpStatus 三态:未配置/已配置/解析失败', () => {
    expect(semanticaMcpStatus(null).configured).toBe(false);
    expect(semanticaMcpStatus('mcp_servers:\n  semantica:\n    enabled: true\n').configured).toBe(true);
    expect(semanticaMcpStatus('mcp_servers:\n  other: {}\n').configured).toBe(false);
    expect(semanticaMcpStatus('mcp_servers: [1, 2').parseError).toBe(true);
  });
});
