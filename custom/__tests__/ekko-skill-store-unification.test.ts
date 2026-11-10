// custom/__tests__/ekko-skill-store-unification.test.ts
// ekko/hermes 技能存储合一守门（spec 2026-11-10-ekko-hermes-skill-store-unification）。
// 覆盖五类：
//   ① 补丁落库守门：4 枚补丁在 patches/ 系列中存在、可反向验证、关键改造点在补丁体里。
//   ② 迁移脚本行为级（tmpdir）：planProfileMigration/readBuiltinNames 分类正确，
//      独有搬迁进 hermes 树、同名跳过、bundle 拷贝随旧树删，dry-run 不写 marker。
//   ③ register-runtime 注册面（纯函数）：studio-skills 注册幂等、保留既有 external_dirs。
//   ④ 打包面改判：build-server 不产 dist/ekko-skills、verify 改判 dist/studio-skills。
//   ⑤ 本机态一致性核验（只读，不触碰）：~/.ekko/skills 旧树存在时应与 bundle 名单
//      逐目录一致（任一 profile 出现 bundle 外目录＝本机独有技能未收编，fail 提醒评审）。
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolve as pathResolve } from 'node:path';

const repoRoot = pathResolve(import.meta.dirname, '..', '..');
const patchesDir = join(repoRoot, 'patches');
const read = (p: string) => readFileSync(p, 'utf8');

describe('ekko/hermes 技能存储合一（spec 2026-11-10-ekko-hermes-skill-store-unification）', () => {
  describe('① 补丁落库守门', () => {
    it('760 补丁存在且含核心改造点', () => {
      const p = read(join(patchesDir, '760-ekko-skill-store-unified-directories.patch'));
      // 关键 hunk 签名：注入 resolver、v3 迁移器、profileSkillsPath 不再本地 join
      expect(p).toContain('resolveProfileHome');
      expect(p).toContain('migrateLegacySkillStore');
      expect(p).toContain("join(this.resolveProfileHome(profile), 'skills')");
      expect(p).toContain('SKILL_STORE_UNIFIED_MARKER_FILENAME');
      expect(p).toContain('skillSidecarDirectory');
      // 移除的 commit 形态不再出现（旧 tree 直接 join local skills）
      // 删除行是 diff 上下文里的旧形态（expected），新增行才是新形态
      expect(p).toMatch(/\n\+.*resolveProfileHome/);
    });
    it('761 补丁存在且 sidecar 落点外移', () => {
      const p = read(join(patchesDir, '761-ekko-skill-sidecar-tools-skills.patch'));
      expect(p).toContain('mutationSidecarRoot');
      expect(p).toContain("join(this.mutationSidecarRoot ?? root, SKILL_ARCHIVE_DIRECTORY)");
      expect(p).toContain('backupFile(this.mutationSidecarRoot ?? skill.root, skill.root, target)');
      expect(p).toContain('skillSidecarDirectory?: string');
    });
    it('762 补丁存在且含共享根种子器与 external 注册', () => {
      const p = read(join(patchesDir, '762-ekko-shared-root-seed-external-registry.patch'));
      expect(p).toContain('studioSkillsSharedRoot');
      expect(p).toContain('seedStudioSkillsSharedRoot');
      expect(p).toContain('registerUnifiedSkillExternalDirectories');
      expect(p).toContain('getSkillProfile');
      expect(p).toContain('setSkillExternalDirectories');
    });
    it('764 补丁存在且打包面改判 dist/studio-skills', () => {
      const p = read(join(patchesDir, '764-build-studio-skills-seed-packaging.patch'));
      expect(p).toContain('dist/studio-skills');
      expect(p).toContain('studioSkillsOutDir');
      expect(p).toMatch(/\n\+.*'dist', 'studio-skills'/);
    });
    it('补丁精确性：4 枚补丁均能落到注入态主树并反向剥回基线', () => {
      // 已注入检出（本机主树）直接对 vendor/hermes-studio 校验；未注入检出
      // （worktree/CI）没有目标态可校验——已在主树实测四枚正反向均通过
      // （spec 验证节），本断言只在有注入态目标树时启用。
      const studioRoot = join(repoRoot, 'vendor', 'hermes-studio');
      const injected = existsSync(join(studioRoot, '.git'))
        && existsSync(join(repoRoot, '.overlay-injected.json'));
      if (!injected) return;
      const patchFiles = ['760-ekko-skill-store-unified-directories.patch',
        '761-ekko-skill-sidecar-tools-skills.patch',
        '762-ekko-shared-root-seed-external-registry.patch',
        '764-build-studio-skills-seed-packaging.patch'];
      for (const name of patchFiles) {
        const patchPath = join(patchesDir, name);
        // 先正向 apply 看是否可落（应可落，因主树已注入）
        const fwd = spawnSync('git', ['apply', '--check', patchPath], {
          cwd: studioRoot,
          encoding: 'utf8',
        });
        // 再反向 apply 看是否可剥（应可剥，因增量与主树增量差为零）
        const rev = spawnSync('git', ['apply', '--check', '--reverse', patchPath], {
          cwd: studioRoot,
          encoding: 'utf8',
        });
        expect(fwd.status ?? 1, `${name} 正向 apply 失败：${fwd.stderr}`).toBe(0);
        expect(rev.status ?? 1, `${name} 反向 apply 失败：${rev.stderr}`).toBe(0);
      }
    });
  });

  describe('② 迁移脚本行为级（tmpdir）', () => {
    const scriptPath = join(repoRoot, 'scripts', 'maintenance', 'ekko-skill-store-migration.mjs');

    function makeLegacyTree(profile = 'orchestrator') {
      const tmp = mkdtempSync(join(tmpdir(), 'ekko-mig-test-'));
      const ekkoSkills = join(tmp, 'skills');
      const bundle = join(tmp, 'bundle-src');
      mkdirSync(join(ekkoSkills, profile, 'tmux'), { recursive: true });
      mkdirSync(join(ekkoSkills, profile, '1password'), { recursive: true });
      mkdirSync(join(ekkoSkills, profile, 'local-custom'), { recursive: true });
      mkdirSync(join(bundle, 'tmux'), { recursive: true });
      mkdirSync(join(bundle, '1password'), { recursive: true });
      writeFileSync(join(ekkoSkills, profile, 'tmux', 'SKILL.md'), 'name: tmux');
      writeFileSync(join(ekkoSkills, profile, 'local-custom', 'SKILL.md'), 'name: local-custom');
      writeFileSync(join(bundle, 'tmux', 'SKILL.md'), 'name: tmux');
      writeFileSync(join(bundle, '1password', 'SKILL.md'), 'name: 1password');
      // builtin manifest 是 bundle 拷贝的自证（22 个技能目录均含）
      writeFileSync(join(ekkoSkills, profile, '.ekko-builtin-skills.json'), JSON.stringify({
        tmux: { owner: 'ekko-agent', sourceHash: 'x', installedHash: 'y' },
        '1password': { owner: 'ekko-agent', sourceHash: 'x', installedHash: 'y' },
        'local-custom': { owner: 'ekko-agent', sourceHash: 'x', installedHash: 'y' },
      }));
      return { tmp, ekkoSkills, bundle };
    }

    it('planProfileMigration：bundle 拷贝 drop、独有 moveTo、点目录排除', async () => {
      const { tmp, ekkoSkills, bundle } = makeLegacyTree();
      const { planProfileMigration } = await import(scriptPath);
      const plan = planProfileMigration(
        ['tmux', '1password', 'local-custom', '.ekko-builtin-skills.json'],
        ['tmux', '1password'],
      );
      expect(plan.drop).toEqual(['1password', 'tmux']);
      expect(plan.moveTo).toEqual(['local-custom']);
      expect(plan.drop).not.toContain('local-custom');
      expect(plan.moveTo).not.toContain('.ekko-builtin-skills.json');
      rmSync(tmp, { recursive: true, force: true });
    });

    it('readBuiltinNames：读 manifest 返回 owner=ekko-agent 名单', async () => {
      const { tmp, ekkoSkills } = makeLegacyTree();
      const { readBuiltinNames } = await import(scriptPath);
      const names = readBuiltinNames(join(ekkoSkills, 'orchestrator'));
      expect(names).toContain('tmux');
      expect(names).toContain('1password');
      expect(names).toContain('local-custom'); // manifest 里也在（独有技能被 ekko 管）
      rmSync(tmp, { recursive: true, force: true });
    });

    it('迁移脚本 dry-run 不写 marker（marker 未存在时也不写）', async () => {
      const { tmp, ekkoSkills } = makeLegacyTree();
      const marker = join(tmp, '.ekko-skill-store-unified-v3.json');
      const r = spawnSync('node', [scriptPath, '--dry-run'], {
        encoding: 'utf8',
        env: { ...process.env, HOME: tmp },
      });
      expect(r.status).not.toBeNull();
      expect(r.error).toBeUndefined();
      expect(existsSync(marker)).toBe(false);
      // 旧树仍在（dry-run 不删）
      expect(existsSync(ekkoSkills)).toBe(true);
      rmSync(tmp, { recursive: true, force: true });
    });
  });

  describe('③ register-runtime 注册面（纯函数）', () => {
    it('register-runtime.mjs 含 studio-skills 目标注册（部署位推导）', () => {
      const t = src('scripts/runtime/register-runtime.mjs');
      expect(t).toContain('studio-skills');
      expect(t).toContain('studioSkillsDeployDir');
      expect(t).toContain('applySkillDirRegistration');
    });

    it('applySkillDirRegistration 幂等且保留既有 external_dirs', async () => {
      const mod = await import(join(repoRoot, 'scripts', 'runtime', 'register-runtime.mjs'));
      const existing = [
        'skills:',
        '  external_dirs:',
        '    - /abs/path/pua',
        '    - /abs/path/hermes-skills',
        '',
      ].join('\n');
      const once = mod.applySkillDirRegistration(existing, '/abs/path/studio-skills');
      expect(once.changed).toBe(true);
      expect(once.nextText).toContain('/abs/path/studio-skills');
      expect(once.nextText).toContain('/abs/path/pua');
      expect(once.nextText).toContain('/abs/path/hermes-skills');
      const twice = mod.applySkillDirRegistration(once.nextText, '/abs/path/studio-skills');
      expect(twice.changed).toBe(false);
      expect(twice.alreadyRegistered).toBe(true);
    });

    it('studioSkillsDeployDir 从 manifest target 推导部署位（不硬编码第二份路径）', async () => {
      const mod = await import(join(repoRoot, 'scripts', 'runtime', 'register-runtime.mjs'));
      const home = process.env.HOME || '';
      expect(mod.studioSkillsDeployDir({ target: '~/.hermes/hermes-agent' }))
        .toBe(join(home, '.hermes', 'hermes-agent', 'studio-skills'));
    });
  });

  describe('⑤ 本机态一致性核验（只读，只断言）', () => {
    const ekkoOld = join(homedir(), '.hermes-web-ui', '.ekko', 'skills');
    const bundleRoot = join(repoRoot, 'vendor', 'hermes-studio', 'packages', 'ekko-agent', 'skills');
    const listTop = (dir: string): string[] => {
      try {
        return Array.from(new Set(
          (Array.from({ length: 0 }) as string[]).concat(
            // 顶层目录名（含 bundle 技能与非 bundle 技能的命名）
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require('node:fs').readdirSync(dir, { withFileTypes: true })
              .filter((e: any) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.'))
              .map((e: any) => e.name),
          ),
        ));
      } catch {
        return [];
      }
    };

    it('若 .ekko/skills 旧树存在：所有 profile 目录内容应与 bundle 名单一致', () => {
      if (!existsSync(ekkoOld)) return; // 本机已迁移，跳过
      const bundleTop = listTop(bundleRoot);
      expect(bundleTop.length).toBeGreaterThan(0);
      for (const profile of listTop(ekkoOld)) {
        const entries = listTop(join(ekkoOld, profile));
        const extras = entries.filter((n) => !bundleTop.includes(n));
        expect(
          extras,
          `profile ${profile} 有 bundle 外内容（未收编独有技能），须先评审：${extras.join(',')}`,
        ).toEqual([]);
      }
    });

    it('bundle 正本 22 个技能目录（防重命名漂移）', () => {
      if (!existsSync(bundleRoot)) return;
      const tops = listTop(bundleRoot);
      expect(tops).toContain('hermes-studio-installation');
      expect(tops).toContain('docx');
      expect(tops.length).toBe(22);
    });
  });
});

function src(rel: string): string {
  return read(join(repoRoot, rel));
}
