// overlay/scripts/verify-clean.mjs
// 校验:上游 .git 历史干净(无本地 commit);工作树状态报告(patch 残留会 WARN)。
// 自包含(不 import config/bootstrap.ts,路径内联)。
import { execSync } from 'child_process';
import { resolve } from 'path';

const overlayRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = resolve(overlayRoot, '..', 'upstream');

function git(args, cwd) {
  try {
    return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (e) {
    return e.stdout?.toString() || '';
  }
}

let ok = true;

// swarm-studio:核心校验对象
const hsRoot = resolve(upstreamRoot, 'swarm-studio');
const hsCommits = git('log --oneline origin/main..HEAD', hsRoot).trim();
const hsStatus = git('status --porcelain', hsRoot).trim();
if (hsCommits) {
  console.error('FAIL: upstream/hermes-studio 有本地 commit:\n' + hsCommits);
  ok = false;
} else {
  console.log('OK: upstream/hermes-studio .git 历史干净(无本地 commit)');
}
if (hsStatus) {
  console.warn('WARN: upstream/hermes-studio 工作树有改动(可能是未 clean 的 B 类 patch):\n' + hsStatus);
} else {
  console.log('OK: upstream/hermes-studio 工作树干净');
}

// element-web / swarm-agent:应为纯上游
for (const repo of ['element-web', 'swarm-agent']) {
  const repoRoot = resolve(upstreamRoot, repo);
  const s = git('status --porcelain', repoRoot).trim();
  if (s) {
    console.warn(`WARN: upstream/${repo} 工作树有改动:\n` + s);
  } else {
    console.log(`OK: upstream/${repo} 工作树干净`);
  }
}

process.exit(ok ? 0 : 1);
