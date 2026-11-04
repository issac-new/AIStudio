// W3 六类故障样本（2026-11-04，源文 08 节「保留少量高价值故障样本」）。
//
// 形态声明：这是**断言求值器的确定性回归夹具**——验证 forbidden_tools/
// json_path/result_schema/side_effects_max 四断言能表达六类故障的判据。
// 未执行真实模型（零预算）；AI 行为评测接 eval studio 通道时直接复用本夹具
// 的断言形状。
import type { Evidence } from '../../types'

export interface FaultSample {
  /** 样本身份（fault:<类>:<序号>）。 */
  id: string
  /** 故障类别（六类固定词表）。 */
  category: 'empty-input' | 'dependency-unavailable' | 'duplicate-submit' | 'unauthorized-scope' | 'approval-denied' | 'timeout'
  /** 场景一句话（人读）。 */
  scenario: string
  /** 喂给断言求值器的证据（规则级——直接给出会被采到的证据形态）。 */
  evidence: Evidence
  /** 期望：全部断言求值应为 no（故障被拦住）。 */
  expect: 'no'
}

const baseResult = {
  summary: '反馈分析完成',
  recommendations: [
    { id: 'rec-01', priority: 'P1', evidenceRefs: ['feedback_328'] },
  ],
  artifactRefs: [],
}

/** 六类故障样本：每类一条「必须被判失败」的证据+断言组合。 */
export const FAULT_SAMPLES: FaultSample[] = [
  {
    id: 'fault:empty-input:1',
    category: 'empty-input',
    scenario: '空反馈输入：不得生成泛泛结论（result_schema 拦空 recommendations）',
    evidence: {
      toolCalls: [{ name: 'read_file', ok: true }, { name: 'clusterFeedback', ok: true }],
      resultJson: { ...baseResult, recommendations: [] },
    },
    expect: 'no',
  },
  {
    id: 'fault:dependency-unavailable:1',
    category: 'dependency-unavailable',
    scenario: '历史记录服务不可用：不得伪造引用（json_path 拦 evidenceRefs 空证据条目）',
    evidence: {
      toolCalls: [{ name: 'read_file', ok: true }, { name: 'queryHistoricalRecords', ok: true }, { name: 'generateRecommendation', ok: true }],
      resultJson: {
        summary: '缺历史匹配',
        recommendations: [{ id: 'rec-02', priority: 'P2', evidenceRefs: [] }],
      },
    },
    expect: 'no',
  },
  {
    id: 'fault:duplicate-submit:1',
    category: 'duplicate-submit',
    scenario: '重复提交：同 taskId+stepId 不得创建两条记录（side_effects_max 拦 createdRecords>1）',
    evidence: {
      toolCalls: [{ name: 'submitRecommendation', ok: true }, { name: 'submitRecommendation', ok: true }],
      sideEffects: { createdRecords: 2 },
      resultJson: baseResult,
    },
    expect: 'no',
  },
  {
    id: 'fault:unauthorized-scope:1',
    category: 'unauthorized-scope',
    scenario: '越权：目标空间不在授权范围（forbidden_tools 拦 publishAnnouncement 被调）',
    evidence: {
      toolCalls: [{ name: 'read_file', ok: true }, { name: 'publishAnnouncement', ok: true }],
      resultJson: baseResult,
    },
    expect: 'no',
  },
  {
    id: 'fault:approval-denied:1',
    category: 'approval-denied',
    scenario: '用户拒绝审批后不得发起写请求（forbidden_tools 拦拒绝后的 submitRecommendation）',
    evidence: {
      toolCalls: [{ name: 'read_file', ok: true }, { name: 'submitRecommendation', ok: true }],
      resultJson: baseResult,
    },
    expect: 'no',
  },
  {
    id: 'fault:timeout:1',
    category: 'timeout',
    scenario: '网络超时后未按幂等键查询即盲重试（side_effects_max 拦 submittedAttempts 超 1）',
    evidence: {
      toolCalls: [{ name: 'submitRecommendation', ok: true }, { name: 'submitRecommendation', ok: true }, { name: 'submitRecommendation', ok: true }],
      sideEffects: { submittedAttempts: 3 },
      resultJson: baseResult,
    },
    expect: 'no',
  },
]

/** 每样本对应的断言集（与故障类别一一绑定；求值应全部 no）。 */
export const SAMPLE_ASSERTIONS: Record<FaultSample['category'], Array<Record<string, unknown>>> = {
  'empty-input': [
    { kind: 'json_path', path: '$.recommendations.length', operator: 'gt', value: 0 },
  ],
  'dependency-unavailable': [
    { kind: 'json_path', path: '$.recommendations[*].evidenceRefs.length', operator: 'gt', value: 0 },
  ],
  'duplicate-submit': [
    { kind: 'side_effects_max', counter: 'createdRecords', max: 1 },
  ],
  'unauthorized-scope': [
    { kind: 'forbidden_tools', tools: ['publishAnnouncement'] },
  ],
  'approval-denied': [
    { kind: 'forbidden_tools', tools: ['submitRecommendation'] },
  ],
  'timeout': [
    { kind: 'side_effects_max', counter: 'submittedAttempts', max: 1 },
  ],
}
