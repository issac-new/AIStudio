#!/usr/bin/env node
// delivery-event.mjs — delivery 协议 v2 事件 JSON 构造器（M3，单一事实源）。
// 被 mx-delivery-lib.sh 调用产出事件 content；合同由 vitest
// custom/server/matrix/__tests__/delivery-harness-contract.test.ts 对账
// （构造输出必须过客户端 delivery-protocol.ts v2 解析器）。
// 用法：
//   node delivery-event.mjs case  --case-id X --title T --repo-url U --tier lite|standard|compliance \
//        --stage P1..P6 --owner ACC --updated-by ACC [--project-id P] [--frozen-acceptance F] [--at MS]
//   node delivery-event.mjs stage --case-id X --stage P1..P6 --worker-account ACC \
//        [--worker-team T] [--worker-profile P] --outcome started|done|failed \
//        [--artifact-ref REF] --reported-by ACC [--at MS]
//   node delivery-event.mjs gate  --case-id X --gate G1..G6|R1..R4 --verdict pass|conditional|reject \
//        --evidence-kind command-exit|artifact|human --evidence-summary S \
//        [--reason R] --decided-by ACC [--at MS]
import { parseArgs } from 'node:util'

const SCHEMA_VERSION = 2
const STAGES = new Set(['P1', 'P2', 'P3', 'P4', 'P5', 'P6'])
const GATES = new Set(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'R1', 'R2', 'R3', 'R4'])
const TIERS = new Set(['lite', 'standard', 'compliance'])
const OUTCOMES = new Set(['started', 'done', 'failed'])
const VERDICTS = new Set(['pass', 'conditional', 'reject'])
const EVIDENCE_KINDS = new Set(['command-exit', 'artifact', 'human'])

function die(msg) {
  console.error(`delivery-event: ${msg}`)
  process.exit(4)
}

function pick(v, allow) {
  if (!v) die(`缺少必填参数`)
  if (allow && !allow.has(v)) die(`非法取值: ${v}（允许 ${[...allow].join('/')}）`)
  return v
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'case-id': { type: 'string' }, title: { type: 'string' }, 'repo-url': { type: 'string' },
    tier: { type: 'string' }, stage: { type: 'string' }, owner: { type: 'string' },
    'updated-by': { type: 'string' }, 'project-id': { type: 'string' },
    'frozen-acceptance': { type: 'string' },
    'worker-account': { type: 'string' }, 'worker-team': { type: 'string' }, 'worker-profile': { type: 'string' },
    outcome: { type: 'string' }, 'artifact-ref': { type: 'string' }, 'reported-by': { type: 'string' },
    gate: { type: 'string' }, verdict: { type: 'string' },
    'evidence-kind': { type: 'string' }, 'evidence-summary': { type: 'string' },
    reason: { type: 'string' }, 'decided-by': { type: 'string' }, at: { type: 'string' },
  },
})

const at = values.at ? Number(values.at) : Date.now()
if (!Number.isFinite(at)) die('--at 须为毫秒整数')
const kind = positionals[0]
let content

if (kind === 'case') {
  content = {
    schemaVersion: SCHEMA_VERSION,
    caseId: pick(values['case-id']),
    title: pick(values.title),
    repoUrl: pick(values['repo-url']),
    tier: pick(values.tier, TIERS),
    stage: pick(values.stage, STAGES),
    ownerAccount: pick(values.owner),
    ...(values['frozen-acceptance'] ? { frozenAcceptance: values['frozen-acceptance'] } : {}),
    ...(values['project-id'] ? { projectId: values['project-id'] } : {}),
    createdAt: at,
    updatedAt: at,
    updatedBy: pick(values['updated-by']),
  }
} else if (kind === 'stage') {
  content = {
    schemaVersion: SCHEMA_VERSION,
    caseId: pick(values['case-id']),
    stage: pick(values.stage, STAGES),
    worker: {
      account: pick(values['worker-account']),
      ...(values['worker-team'] ? { agentTeam: values['worker-team'] } : {}),
      ...(values['worker-profile'] ? { profile: values['worker-profile'] } : {}),
    },
    outcome: pick(values.outcome, OUTCOMES),
    ...(values['artifact-ref'] ? { artifactRef: values['artifact-ref'] } : {}),
    reportedBy: pick(values['reported-by']),
    at,
  }
} else if (kind === 'gate') {
  if (['reject', 'conditional'].includes(values.verdict ?? '') && !values.reason) {
    die('verdict=reject/conditional 必填 --reason（打回必附方向）')
  }
  content = {
    schemaVersion: SCHEMA_VERSION,
    caseId: pick(values['case-id']),
    gate: pick(values.gate, GATES),
    verdict: pick(values.verdict, VERDICTS),
    evidence: {
      kind: pick(values['evidence-kind'], EVIDENCE_KINDS),
      summary: pick(values['evidence-summary']),
    },
    ...(values.reason ? { reason: values.reason } : {}),
    decidedBy: pick(values['decided-by']),
    at,
  }
} else {
  die(`未知事件类别: ${kind}（允许 case/stage/gate）`)
}

process.stdout.write(JSON.stringify(content))
