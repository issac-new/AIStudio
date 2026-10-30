// overlay/scripts/skill-build.mjs
// `npm run skill:build` 入口（2026-10-30 HelixHarness 吸收轮）。
//
// 为什么加一层：生成器的 `--upgrade` 要求目标技能已存在（.claude/skills/<name>/），
// 而 worktree 与新克隆里那个目录天然不在（.claude/ 是本地生成物、不入库）。直接暴露
// 生成器会给出「ERROR: 目标技能不存在」的裸错误，看不出该怎么办。这里把两种情况分开：
//   - 技能目录存在（主检出）→ 跑生成器 --upgrade，同时渲染 L2 判定库副本到 .swarm-yuan/hooks/；
//   - 技能目录缺席（worktree/新克隆）→ 明确说明「副本已入库、无需渲染」，并给重建入口，
//     以非零退出让调用方知道这一步没有执行（不静默成功）。
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const skillDir = resolve(root, '.claude/skills/aistudio-dev');
const generator = resolve(root, 'skills/swarm-yuan/scripts/generate-skill.sh');

if (!existsSync(generator)) {
  console.error('[skill:build] 生成器缺席：skills/swarm-yuan/scripts/generate-skill.sh');
  process.exit(2);
}

if (!existsSync(skillDir)) {
  console.error(
    [
      '[skill:build] 本检出没有生成态技能目录：',
      `  ${skillDir}`,
      '原因：.claude/ 属本地生成物、不入库（.gitignore），worktree 与新克隆天然缺席。',
      '影响：无。L2 判定库、提交钩子与最小判定面已入库到 .swarm-yuan/hooks/，',
      '      钩子由 npm run hooks:install（ensure-injected 也会补装）启用。',
      '如需完整重建技能：在主检出（生成过技能的机器）运行本命令。',
    ].join('\n'),
  );
  process.exit(2);
}

const r = spawnSync('bash', [generator, '--upgrade', 'aistudio-dev', root, '.claude/skills'], {
  cwd: root,
  stdio: 'inherit',
});
if (r.status !== 0) {
  console.error(`[skill:build] 生成器退出码 ${r.status ?? 'signal'}（未完成）`);
  process.exit(r.status ?? 1);
}
console.log('[skill:build] 完成：技能与 .swarm-yuan/hooks/ 判定库副本已按 assets 渲染');
