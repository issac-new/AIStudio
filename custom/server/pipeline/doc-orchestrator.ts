// overlay/custom/server/pipeline/doc-orchestrator.ts
// 文档编排器（2026-10-18 run21「总分总」用户指令产品化）：
// 报告类任务拆章节片并行起草→汇总人合并（拆分-并行-汇总机器化）。
// run21 实录：测试报告单写 40 分钟 → BE/FE 双片并行+汇总压半；审计意见书同构。
// 与 parallel-review 同骨架（编排器模式第三件：评审/派发安全/文档）。
// 开关：DOC_ORCHESTRATOR=off 旁路；REST /api/hermes/pipeline/doc/start 触发一次性
// 编排，状态持久化 <home>/runtime/doc-orchestrator-state.json，巡检环接力收集。

import { join } from 'node:path'

export interface DocSection {
  /** 起草人档案名（matrix 后缀自动 -agent） */
  writer: string
  /** 章节片描述（派发词内嵌；含产物路径） */
  section: string
  /** 产物文件路径（收集判定：文件出现在中央仓即回执） */
  artifactPath: string
  /** 回执前缀（结论行收集备用） */
  receiptPrefix: string
  receipt?: string
  dispatchedAt?: number
  receiptAt?: number
}

export interface DocOrchestration {
  id: string
  /** 汇总人（总分总之总；合并成稿+终回执） */
  assembler: string
  /** 终回执前缀 */
  finalReceiptPrefix: string
  sections: DocSection[]
  createdAt: number
  status: 'dispatched' | 'collecting' | 'done'
  finalReceipt?: string
}

export interface DocOrchestratorDeps {
  home?: string
  stateFile?: string
  room?: string
  send?: (body: string, mentions: string[]) => Promise<string | undefined>
  now?: () => number
}

/** 派发词内嵌安全条款（与 DISPATCH_SAFETY 同族：并行片互不等待+单步收口） */
export const SECTION_SAFETY =
  '（并行分工：独立会话只写本章节片，与其他片互不等待；首节完成即先 push 一次（途中锚）；做完即回执一行，勿展开其他工作。）'

/** 测试报告拆解模板（run21 实录固化；扩展点：审计意见书/复盘素材同构） */
export function testReportSections(rfdId: string): Omit<DocSection, 'dispatchedAt' | 'receiptAt'>[] {
  return [
    { writer: 'qi', section: `BE 章节片（范围与环境/后端用例-结果矩阵/缺陷统计/回归结论/残留风险+V8.20 五项标注）`, artifactPath: `docs/test/${rfdId}-test-report-BE.md`, receiptPrefix: 'BE-SECTION-DONE' },
    { writer: 'fei', section: `FE 章节片（前端用例-结果矩阵/缺陷统计/回归结论/残留风险+V8.20 五项标注）`, artifactPath: `docs/test/${rfdId}-test-report-FE.md`, receiptPrefix: 'FE-SECTION-DONE' },
  ]
}

export function docOrchestrator(deps: DocOrchestratorDeps = {}) {
  const home = deps.home ?? process.env.HERMES_WEB_UI_HOME ?? process.env.HOME ?? '.'
  const stateFile = deps.stateFile ?? join(home, 'runtime', 'doc-orchestrator-state.json')
  const send = deps.send
  const room = deps.room
  const now = deps.now ?? Date.now

  async function start(
    id: string, assembler: string, finalReceiptPrefix: string,
    sections: Omit<DocSection, 'dispatchedAt' | 'receiptAt'>[],
  ): Promise<DocOrchestration> {
    const orch: DocOrchestration = {
      id, assembler, finalReceiptPrefix,
      sections: sections.map(s => ({ ...s, dispatchedAt: now() })),
      createdAt: now(), status: 'dispatched',
    }
    if (send && room) {
      for (const s of orch.sections) {
        await send(
          `【文档编排·章节片】${s.section}\n产物：${s.artifactPath}${SECTION_SAFETY}\n回执行：${s.receiptPrefix}`,
          [`@${s.writer}-agent`],
        )
      }
      await send(
        `【文档编排·汇总篇】各章节片已并行派发（${orch.sections.map(s => s.receiptPrefix).join('/')}），片齐后你合并成稿并回 ${finalReceiptPrefix}。`,
        [`@${assembler}-agent`],
      )
    }
    return orch
  }

  return { start, stateFile }
}
