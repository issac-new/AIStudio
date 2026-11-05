// release:gate 发布准出真实执行链（P1 平台重写 Task 9）。
//
// 顺序（spec §4.4-2）：qgate 构建 → 全量测试门（真 npm test + JUnit 编排层复析）→
// 评测门 → 启用门池逐门（--require-pass --no-cache）→ 服务端/客户端类型双门 →
// build:full（内含 server tsc + verify-dist --server）→ 严格 release-report
//（--require-pass --no-cache --since <本 gate 起点>）。任一步非 PASS 即停：
// 不执行后续步、退出非零、receipt 如实记 failed。
//
// 证据接线：每步产九字段 EvidenceRecord（producer='release-gate'，commit=当前 HEAD
// 真值），经 custom/server/platform/evidence/evidence-store.appendEvidence 落 JSONL
//（复用存储校验单一事实源；supplement/declaredMissing 属 producer 层不落盘——
// 准出链 commit 恒传真值，见 spec 决策记录 P1-9）。
//
// 测试/沙箱 seam（全部缺省=真实链路）：
//   RELEASE_GATE_STEPS_FILE   JSON {steps:[{id,label,argv,junit?}]} 替换内建步序
//   RELEASE_GATE_RECEIPT      receipt 落点（缺省 .qgate/release-gate.json）
//   PLATFORM_EVIDENCE_FILE    证据 JSONL 落点（evidence-store 原生 env）
//   RELEASE_GATE_JUNIT_FILE   JUnit 复析文件（缺省 .qgate/junit-report.xml）
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const overlayRoot = resolve(import.meta.dirname, '..', '..', '..');
const qgateCli = resolve(overlayRoot, 'custom/qgate/dist/cli.js');

const startedAtMs = Date.now();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: overlayRoot, encoding: 'utf8' }).trim();

// 入口守卫：作为模块被导入（编排测试锚定 builtinSteps）时不执行主链。
const isEntry = (() => {
  try { return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();

/** JUnit XML 复析：聚合 testsuite(s) 的 failures/errors 属性（编排层独立于门内核）。 */
function junitFailureCounts(file) {
  const text = readFileSync(file, 'utf8');
  let failures = 0;
  let errors = 0;
  let suites = 0;
  for (const m of text.matchAll(/<(?:testsuites\/)?testsuite\b[^>]*>/g)) {
    const tag = m[0];
    const f = /\bfailures\s*=\s*"(\d+)"/.exec(tag);
    const e = /\berrors\s*=\s*"(\d+)"/.exec(tag);
    failures += f ? Number(f[1]) : 0;
    errors += e ? Number(e[1]) : 0;
    suites += 1;
  }
  // 兜底：属性缺失时数实体元素（报告器方言差异不失守）
  const failureEls = (text.match(/<(?:failure|error)\b/g) ?? []).length;
  if (suites === 0 && failureEls > 0) return { failures: failureEls, errors: 0, suites };
  return { failures, errors, suites };
}

/** 内建步序（argv 中 '{START_TS}' 于执行时替换为 gate 起点时戳）。编排测试锚定：typecheck 双门与严格报告步不得缺席。 */
export function builtinSteps() {
  const gate = (id) => ['node', qgateCli, 'run', id, '--trigger', 'release', '--include-disabled', '--require-pass', '--no-cache'];
  return [
    { id: 'qgate-build', label: 'qgate 框架构建（tsc）', argv: ['npm', 'run', 'qgate:build'] },
    { id: 'gate-basic-check', label: '全量测试门（真 npm test + JUnit 复析）', argv: gate('engineering.basic-check'), junit: true },
    { id: 'gate-harness-eval', label: '评测门（test:eval 七维回归）', argv: gate('engineering.harness-eval') },
  ];
}

/** 启用门池枚举（status --json；缺 basic-check/harness-eval 已先行步跑过）。 */
function poolSteps() {
  const r = spawnSync('node', [qgateCli, 'status', '--json'], { cwd: overlayRoot, encoding: 'utf8' });
  if (r.status !== 0 && !r.stdout?.trim()) {
    throw new Error(`release:gate 门池枚举失败（qgate status --json 无输出，exit=${r.status}）：${r.stderr ?? ''}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    throw new Error(`release:gate 门池枚举失败（status --json 非法 JSON）：${e.message}`);
  }
  const done = new Set(['engineering.basic-check', 'engineering.harness-eval']);
  const ids = (parsed?.gates ?? []).map((g) => g.gateId).filter((id) => typeof id === 'string' && !done.has(id));
  return ids.map((id) => ({
    id: `gate-${id}`,
    label: `启用门 ${id}（--require-pass --no-cache）`,
    argv: ['node', qgateCli, 'run', id, '--trigger', 'release', '--require-pass', '--no-cache'],
  }));
}

/** 解析步序：seam 优先，缺省=内建三步+门池+双类型门+build:full+严格报告。
 * withPool=false 跳过门池枚举（编排测试锚定静态步序用——不 spawn status 子进程）。 */
export function resolveSteps({ withPool = true } = {}) {
  const seam = process.env.RELEASE_GATE_STEPS_FILE?.trim();
  if (seam) {
    const parsed = JSON.parse(readFileSync(resolve(seam), 'utf8'));
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) throw new Error('RELEASE_GATE_STEPS_FILE 形状非法（steps 非空数组）');
    return parsed.steps.map((s) => ({ id: s.id, label: s.label ?? s.id, argv: s.argv, junit: s.junit === true }));
  }
  return [
    ...builtinSteps(),
    ...(withPool ? poolSteps() : []),
    { id: 'typecheck-harness', label: '服务端类型门（typecheck:harness）', argv: ['npm', 'run', 'typecheck:harness'] },
    { id: 'typecheck-client', label: '客户端类型棘轮门（typecheck:client:ratchet ≤ 基线）', argv: ['npm', 'run', 'typecheck:client:ratchet'] },
    { id: 'build-full', label: '完整构建（build:full：server tsc + verify-dist --server）', argv: ['npm', 'run', 'build:full'] },
    {
      id: 'release-report',
      label: '严格证据报告（--require-pass --no-cache --since gate 起点）',
      argv: ['node', qgateCli, 'release-report', '--require-pass', '--no-cache', '--since', '{START_TS}'],
    },
  ];
}

/**
 * 九字段证据追加：经 evidence-store.appendEvidence（校验+白名单投影单一事实源）。
 * ts-node transpile-only 子进程加载 TS 模块——与 serve-server 同款加载基建。
 */
function appendEvidence(record) {
  const storeTs = resolve(overlayRoot, 'custom/server/platform/evidence/evidence-store.ts');
  const shim = `const s = require(${JSON.stringify(storeTs)}); s.appendEvidence(${JSON.stringify(record)});`;
  const r = spawnSync(process.execPath, ['-r', 'ts-node/register', '--eval', shim], {
    cwd: overlayRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      // 服务端工程 tsconfig（rootDirs/include=src）不接受仓内其它树的单文件编译；
      // 用本目录专用最小 tsconfig（rootDir=仓根）transpile-only 加载。
      TS_NODE_PROJECT: 'scripts/platform/release/tsconfig.evidence.json',
      TS_NODE_TRANSPILE_ONLY: '1',
    },
  });
  if (r.status !== 0) {
    throw new Error(`release:gate 证据落盘失败（appendEvidence exit=${r.status}）：${(r.stderr ?? r.stdout ?? '').slice(0, 400)}`);
  }
}

function runStep(step) {
  const argv = step.argv.map((a) => String(a).replaceAll('{START_TS}', String(startedAtMs)));
  const [cmd, ...args] = argv;
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: overlayRoot, stdio: 'inherit', env: process.env });
  const exitCode = r.status;
  let failure = exitCode === 0 ? null : `exit=${exitCode ?? 'signal'}`;
  // JUnit 编排层复析：门内核 exit 0 ≠ 测试全绿——报告含失败/错误即拦（防报告器/钩子
  // 吞错；内核另有 minTotal 缩水检查，此处只管 failures/errors 面）。
  if (!failure && step.junit) {
    const junitFile = process.env.RELEASE_GATE_JUNIT_FILE?.trim()
      ?? resolve(overlayRoot, '.qgate', 'junit-report.xml');
    if (!existsSync(junitFile)) {
      failure = `JUnit 复析失败：${junitFile} 缺席（门声明产出测试报告但未落盘）`;
    } else {
      const { failures, errors, suites } = junitFailureCounts(junitFile);
      if (suites === 0) failure = 'JUnit 复析失败：无 testsuite 条目（报告非预期形态）';
      else if (failures > 0 || errors > 0) failure = `JUnit 复析拦截：failures=${failures} errors=${errors}（exit 0 不代表全绿）`;
    }
  }
  return { step, exitCode: exitCode ?? -1, failure, startedAt: t0, endedAt: Date.now() };
}

// ── 主链 ────────────────────────────────────────────────────────────────────
// 入口守卫下执行（模块导入方只消费导出的步序构造器）。
export const gateMain = () => {
const steps = resolveSteps();
const receiptPath = process.env.RELEASE_GATE_RECEIPT?.trim()
  ?? resolve(overlayRoot, '.qgate', 'release-gate.json');
const evidenceId = `release-gate/${startedAtMs}`;
const receipt = {
  evidenceId,
  status: 'complete',
  commit,
  startedAt: startedAtMs,
  endedAt: null,
  failedStep: null,
  steps: [],
};

function writeReceipt() {
  mkdirSync(dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

console.log(`\n[release:gate] ▶ 准出开始：HEAD=${commit.slice(0, 12)}，${steps.length} 步`);
let failed = false;
for (const step of steps) {
  if (failed) break;
  console.log(`\n[release:gate] ▶ ${step.id} — ${step.label}`);
  const result = runStep(step);
  const status = result.failure ? 'fail' : 'pass';
  receipt.steps.push({
    id: step.id, label: step.label, status,
    exitCode: result.exitCode, failure: result.failure,
    startedAt: result.startedAt, endedAt: result.endedAt,
  });
  // 每步产证：commit=HEAD 真值、sourceDigest=判词（退出码/复析结论），fail 也是证据。
  try {
    appendEvidence({
      evidenceId: `${evidenceId}/${step.id}`,
      subjectId: `release-gate/${step.id}`,
      status,
      producer: 'release-gate',
      commit,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      sourceDigest: result.failure ?? `exit=0 ${step.label}`,
      artifactRefs: [],
    });
  } catch (e) {
    // 证据写不进必须可见（evidence-store 决策：不吞）——准出链降级为失败。
    receipt.steps[receipt.steps.length - 1].evidenceError = e.message;
    receipt.status = 'failed';
    receipt.failedStep = step.id;
    receipt.endedAt = Date.now();
    writeReceipt();
    console.error(`\n[release:gate] ✗ ${step.id} 证据落盘失败：${e.message}`);
    process.exit(1);
  }
  if (result.failure) {
    failed = true;
    receipt.status = 'failed';
    receipt.failedStep = step.id;
    console.error(`\n[release:gate] ✗ ${step.id} 失败（${result.failure}）——停止后续步，准出不通过`);
  } else {
    console.log(`[release:gate] ✓ ${step.id}（${((result.endedAt - result.startedAt) / 1000).toFixed(1)}s）`);
  }
}
receipt.endedAt = Date.now();
writeReceipt();
console.log(`\n[release:gate] ${failed ? '✗ 准出未通过' : '✓ 准出通过'}：receipt → ${receiptPath}（${receipt.steps.length} 步，commit ${commit.slice(0, 12)}）`);
process.exit(failed ? 1 : 0);
};

if (isEntry) gateMain();
