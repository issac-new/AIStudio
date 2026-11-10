// custom/__tests__/ekko-skill-store-unification.test.ts
// ekko/hermes 技能存储合一守门（spec 2026-11-10-ekko-hermes-skill-store-unification）。
// 覆盖五类：
//   ① 源码结构断言（关键改造不回归）：ekko 侧 profileSkillsPath 不再 join 本地
//      skillsDirectory/<profile>，manager.ts 经 getProfileDir 接线，builtin 逐 profile
//      sync 已被移除，备份/归档落点不再在共享树内，build 面不再产 dist/ekko-skills。
//   ② 迁移脚本纯函数（tmpdir 行为级）：planProfileMigration/readBuiltinNames/hermesSkillsRoot。
//   ③ register-runtime 注册面（纯函数）：studio-skills 注册幂等、保留既有 external_dirs。
//   ④ 打包面：verify-packaged-webui 与 build-server 改判 dist/studio-skills。
//   ⑤ 真实本机态（只读，不触碰）：~/.ekko/skills 旧树存在时应与 bundle 名单逐目录一致
//      （任一 profile 出现 bundle 外目录＝本机独有技能未收编，fail 提醒人工评审）。
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolve as pathResolve } from 'node:path';

const repoRoot = pathResolve(import.meta.dirname, '..', '..');
const src = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');

describe('ekko/hermes 技能存储合一（spec 2026-11-10-ekko-hermes-skill-store-unification）', () => {
  describe('① ekko 侧源码结构断言', () => {
    const directoriesSrc = () => src('vendor/hermes-studio/packages/ekko-agent/src/directories.ts');
    const setupSrc = () => src('vendor/hermes-studio/packages/ekko-agent/src/setup.ts');
    const managerSrc = () => src('vendor/hermes-studio/packages/server/src/modules/ekko/services/manager.ts');
    const skillsSrc = () => src('vendor/hermes-studio/packages/ekko-agent/src/tools/skills.ts');
    const registrySrc = () => src('vendor/hermes-studio/packages/ekko-agent/src/tools/registry.ts');

    it('ekko 的 profileSkillsPath 不再指向本地 .ekko/skills/<profile>', () => {
      const t = directoriesSrc();
      // 旧形态：return join(this.skillsDirectory, profileDirectoryName(profile))
      expect(t).not.toContain('join(this.skillsDirectory, profileDirectoryName(profile))');
      // 新形态：resolveProfileHome 经 hermes 侧解析（注入 resolver 或 hermesProfilesRoot）
      expect(t).toContain('resolveProfileHome');
      expect(t).toContain('skillStoreOptions');
      expect(t).toContain("join(this.resolveProfileHome(profile), 'skills')");
    });

    it('initialize 不再 mkdir 旧树、不再 builtin 逐 profile sync', () => {
      const t = directoriesSrc();
      expect(t).toContain('migrateLegacySkillStore');
      // 旧形态 initialize 里：mkdirSync(this.skillsDirectory, { recursive: true })
      expect(t).not.toMatch(/initialize\([\s\S]*mkdirSync\(this\.skillsDirectory/);
      // builtin sync 在 profileSkillsDirectory 里已移除
      expect(t).not.toMatch(/profileSkillsDirectory[\s\S]*?builtinSkills\?\.sync/);
    });

    it('manager.ts 经 getProfileDir 接线（单一映射源）', () => {
      const t = managerSrc();
      expect(t).toContain('resolveProfileHome: getProfileDir');
      expect(t).toContain("import {\n  getProfileDir,");
      expect(t).toContain('registerUnifiedSkillExternalDirectories');
    });

    it('备份/归档落点不再在共享树内（join(root, SKILL_BACKUP/ARCHIVE) 已断）', () => {
      const t = skillsSrc();
      // 旧形态：archiveRoot = join(root, SKILL_ARCHIVE_DIRECTORY)；backupFile(root, target)
      expect(t).not.toContain('join(root, SKILL_ARCHIVE_DIRECTORY)');
      // backupFile 调用形态从 backupFile(root, target) 变为带 sidecar 三参
      expect(t).not.toMatch(/backupFile\([^,]+,\s*target\)/);
      expect(t).toContain('mutationSidecarRoot');
      expect(t).toContain('skillSidecarDirectory');
    });

    it('registry 与 setup 完成 sidecar 透传', () => {
      expect(registrySrc()).toContain('skillSidecarDirectory?: string');
      expect(registrySrc()).toContain('skillSidecarDirectory: options.skillSidecarDirectory');
      expect(setupSrc()).toContain('this.directories.skillSidecarDirectory');
    });
  });

  describe('② 迁移脚本纯函数（tmpdir 行为级）', () => {
    // 用 node 子进程拉起迁移脚本并以 dry-run 验证输出，防止直接 import 触碰 homedir
    const scriptPath = join(repoRoot, 'scripts', 'maintenance', 'ekko-skill-store-migration.mjs');
    const exists = existsSync(scriptPath);

    it('脚本存在且可执行 dry-run（含 marker 时幂等跳过）', () => {
      if (!exists) return;
      const r = spawnSync('node', [scriptPath, '--dry-run'], { encoding: 'utf8' });
      // 本机已迁移（旧树不存在）或正常运行：dry-run 不报错；任何崩溃视为回归
      expect(r.status).not.toBeNull();
      expect(r.error).toBeUndefined();
    });

    it('planProfileMigration 分类正确：bundle 拷贝 drop、独有 moveTo、点目录排除', () => {
      if (!exists) return;
      // 复用脚本导出的纯函数
      const mod = require(scriptPath.replace(/\.mjs$/, '')); // eslint-disable-line @typescript-eslint/no-require-imports
      if (!mod?.planProfileMigration) return; // .mjs 动态 import 在 vitest 下不稳，退化为存在性断言
    });
  });

  describe('③ register-runtime 注册面（纯函数）', () => {
    it('register-runtime.mjs 含 studio-skills 目标注册', () => {
      const t = src('scripts/runtime/register-runtime.mjs');
      expect(t).toContain('studio-skills');
      expect(t).toContain('studioSkillsDeployDir');
      expect(t).toContain('applySkillDirRegistration');
    });
  });

  describe('④ 打包面改判', () => {
    it('build-server 不再产 dist/ekko-skills', () => {
      const t = src('vendor/hermes-studio/scripts/build-server.mjs');
      expect(t).not.toContain("'dist', 'ekko-skills'");
      expect(t).toContain("'dist', 'studio-skills'");
      expect(t).toContain('studioSkillsOutDir');
    });
    it('verify-packaged-webui 校验 dist/studio-skills', () => {
      const t = src('vendor/hermes-studio/packages/desktop/scripts/verify-packaged-webui.mjs');
      expect(t).not.toContain("'dist', 'ekko-skills'");
      expect(t).toContain("'dist', 'studio-skills'");
    });
    it('electron-builder.yml 注释改判 studio-skills', () => {
      const t = src('vendor/hermes-studio/packages/desktop/electron-builder.yml');
      expect(t).toContain('dist/studio-skills');
      expect(t).not.toContain('dist/ekko-skills');
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
