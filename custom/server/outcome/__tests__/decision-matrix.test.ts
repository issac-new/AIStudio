// outcome 决策画像与授权矩阵守门（spec §4.3，Task 5）。
// 四块：
//   1) decision-vectors.json 全量断言——TS/Python 双侧共享判定向量的 TS 侧消费面
//      （Python 侧 Task 11 直读同一文件，两侧判定不得漂移）；
//   2) classifyDecisionProfile 三维映射（riskTier 同判据／reversibility v1／externalEffect 词表）；
//   3) combineProfiles 只调严语义（调松忽略并记 basis）；
//   4) evaluateOutcomeAction 逐格矩阵＋decidedBy/rule 钉面。
import { describe, expect, it } from 'vitest'
import vectors from '../decision-vectors.json'
import { classifyDecisionProfile, combineProfiles, evaluateOutcomeAction } from '../decision-matrix'
import type { DecisionProfile } from '../types'

const profile = (
  riskTier: DecisionProfile['riskTier'],
  reversibility: DecisionProfile['reversibility'],
  externalEffect: boolean,
): DecisionProfile => ({ riskTier, reversibility, externalEffect, basis: [] })

describe('共享判定向量（decision-vectors.json）', () => {
  it('规模 ≥30 且结构合法（mode/riskTier/reversibility 全在枚举内）', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(30)
    const modes = new Set(['build', 'guarded', 'plan', 'yolo'])
    const risks = new Set(['low', 'medium', 'high'])
    const revs = new Set(['reversible', 'costly', 'one-way', 'unknown'])
    const actions = new Set(['allow', 'ask', 'deny'])
    for (const v of vectors) {
      expect(modes.has(v.mode), JSON.stringify(v)).toBe(true)
      expect(risks.has(v.profile.riskTier), JSON.stringify(v)).toBe(true)
      expect(revs.has(v.profile.reversibility), JSON.stringify(v)).toBe(true)
      expect(typeof v.profile.externalEffect, JSON.stringify(v)).toBe('boolean')
      expect(actions.has(v.expected.action), JSON.stringify(v)).toBe(true)
      expect(typeof v.expected.dualSignRequired, JSON.stringify(v)).toBe('boolean')
    }
  })

  it('覆盖面：四 mode×三 risk×四 reversibility×externalEffect 代表格＋plan 格＋high+one-way 双签格', () => {
    const modes = new Set(vectors.map(v => v.mode))
    expect(modes).toEqual(new Set(['build', 'guarded', 'plan', 'yolo']))
    const risks = new Set(vectors.map(v => v.profile.riskTier))
    expect(risks).toEqual(new Set(['low', 'medium', 'high']))
    const revs = new Set(vectors.map(v => v.profile.reversibility))
    expect(revs).toEqual(new Set(['reversible', 'costly', 'one-way', 'unknown']))
    const externals = new Set(vectors.map(v => v.profile.externalEffect))
    expect(externals).toEqual(new Set([true, false]))
    // plan 格：一律 deny（含 low+reversible 只读形态——plan 挡对 outcome-scoped 动作拒绝）
    const planCells = vectors.filter(v => v.mode === 'plan')
    expect(planCells.length).toBeGreaterThanOrEqual(3)
    for (const v of planCells) expect(v.expected.action, JSON.stringify(v)).toBe('deny')
    // high+one-way 双签格：build/guarded/yolo 三挡都得有 ask+dualSign
    const dualSignModes = new Set(
      vectors.filter(v => v.expected.dualSignRequired).map(v => v.mode),
    )
    expect(dualSignModes).toEqual(new Set(['build', 'guarded', 'yolo']))
  })

  it('分歧面钉死：medium|costly 非严格格（ext=false）build=ask、guarded/yolo=allow，三格×三挡全在向量内', () => {
    // 审查 I1（2026-11-19）：low/costly 分歧格曾缺失——Python 侧直读向量文件，
    // 缺格=双侧守门盲区；本断言把 medium|costly 全部非严严格的三挡向量钉成必在。
    const divergenceCells = [
      { riskTier: 'medium', reversibility: 'reversible' },
      { riskTier: 'medium', reversibility: 'costly' },
      { riskTier: 'low', reversibility: 'costly' },
    ] as const
    for (const cell of divergenceCells) {
      for (const mode of ['build', 'guarded', 'yolo'] as const) {
        const hit = vectors.find(
          v => v.mode === mode
            && v.profile.riskTier === cell.riskTier
            && v.profile.reversibility === cell.reversibility
            && v.profile.externalEffect === false,
        )
        const label = `${mode} × ${cell.riskTier}/${cell.reversibility}/ext=false`
        expect(hit, label).toBeDefined()
        expect(hit?.expected.action, label).toBe(mode === 'build' ? 'ask' : 'allow')
        expect(hit?.expected.dualSignRequired, label).toBe(false)
      }
    }
  })

  it('全量向量逐格与 evaluateOutcomeAction 一致', () => {
    for (const v of vectors) {
      const label = `${v.mode} × ${v.profile.riskTier}/${v.profile.reversibility}/ext=${v.profile.externalEffect}`
      const d = evaluateOutcomeAction({
        mode: v.mode,
        profile: profile(v.profile.riskTier, v.profile.reversibility, v.profile.externalEffect),
      })
      expect({ action: d.action, dualSignRequired: d.dualSignRequired }, label).toEqual(v.expected)
    }
  })
})

describe('classifyDecisionProfile 三维映射', () => {
  it('命令：one-way 词表命中 → one-way（publish/git push/drop|truncate table/kubectl delete/发布/上线/发版）', () => {
    expect(classifyDecisionProfile({ kind: 'command', detail: 'git push origin main' }))
      .toMatchObject({ riskTier: 'high', reversibility: 'one-way', externalEffect: true })
    expect(classifyDecisionProfile({ kind: 'command', detail: 'npm publish' }))
      .toMatchObject({ riskTier: 'high', reversibility: 'one-way', externalEffect: true })
    expect(classifyDecisionProfile({ kind: 'command', detail: 'drop table payments' }))
      .toMatchObject({ riskTier: 'high', reversibility: 'one-way', externalEffect: false })
    expect(classifyDecisionProfile({ kind: 'command', detail: 'truncate table users' }))
      .toMatchObject({ riskTier: 'high', reversibility: 'one-way', externalEffect: false })
    expect(classifyDecisionProfile({ kind: 'command', detail: 'kubectl delete pod web-0' }))
      .toMatchObject({ riskTier: 'high', reversibility: 'one-way', externalEffect: false })
    expect(classifyDecisionProfile({ kind: 'command', detail: '执行发布流水线' }))
      .toMatchObject({ riskTier: 'high', reversibility: 'one-way', externalEffect: false })
    expect(classifyDecisionProfile({ kind: 'command', detail: '新版本上线' }))
      .toMatchObject({ riskTier: 'high', reversibility: 'one-way', externalEffect: false })
    expect(classifyDecisionProfile({ kind: 'command', detail: '发版前检查清单' }))
      .toMatchObject({ reversibility: 'one-way' })
  })

  it('命令：纯只读（LOW_COMMAND_LEAD 判 low）→ reversible', () => {
    expect(classifyDecisionProfile({ kind: 'command', detail: 'ls -la' }))
      .toMatchObject({ riskTier: 'low', reversibility: 'reversible', externalEffect: false })
    expect(classifyDecisionProfile({ kind: 'command', detail: 'cat package.json' }))
      .toMatchObject({ riskTier: 'low', reversibility: 'reversible', externalEffect: false })
    expect(classifyDecisionProfile({ kind: 'command', detail: 'git status' }))
      .toMatchObject({ riskTier: 'low', reversibility: 'reversible', externalEffect: false })
    expect(classifyDecisionProfile({ kind: 'command', detail: 'git -C /repo log --oneline' }))
      .toMatchObject({ riskTier: 'low', reversibility: 'reversible', externalEffect: false })
  })

  it('命令：其余写副作用 → unknown（v1 不自动判 costly；costly 只经 declared 调严进入）', () => {
    expect(classifyDecisionProfile({ kind: 'command', detail: 'npm test' }))
      .toMatchObject({ riskTier: 'medium', reversibility: 'unknown', externalEffect: false })
    expect(classifyDecisionProfile({ kind: 'command', detail: 'git commit -m "feat: x"' }))
      .toMatchObject({ riskTier: 'medium', reversibility: 'unknown', externalEffect: false })
    // 高危但不在 one-way 词表（kill/rm）：risk=high、reversibility 仍 unknown
    expect(classifyDecisionProfile({ kind: 'command', detail: 'rm -rf node_modules' }))
      .toMatchObject({ riskTier: 'high', reversibility: 'unknown', externalEffect: false })
    // 空 detail 保守：medium/unknown
    expect(classifyDecisionProfile({ kind: 'command', detail: '' }))
      .toMatchObject({ riskTier: 'medium', reversibility: 'unknown', externalEffect: false })
  })

  it('命令：对外词表（push/publish/deploy/发送/上传）→ externalEffect=true', () => {
    expect(classifyDecisionProfile({ kind: 'command', detail: '发送邮件给客户' }))
      .toMatchObject({ riskTier: 'medium', reversibility: 'unknown', externalEffect: true })
    expect(classifyDecisionProfile({ kind: 'command', detail: '上传产物到 OSS' }))
      .toMatchObject({ riskTier: 'medium', reversibility: 'unknown', externalEffect: true })
    expect(classifyDecisionProfile({ kind: 'command', detail: 'docker push registry/app:1' }))
      .toMatchObject({ externalEffect: true })
    expect(classifyDecisionProfile({ kind: 'command', detail: 'helm deploy prod' }))
      .toMatchObject({ externalEffect: true })
  })

  it('命令：git 全局旗标剥除后 one-way 判据不漏网', () => {
    expect(classifyDecisionProfile({ kind: 'command', detail: 'git -C /Volumes/repo push origin main' }))
      .toMatchObject({ riskTier: 'high', reversibility: 'one-way', externalEffect: true })
  })

  it('命令：basis 记录三维判据来源', () => {
    const p = classifyDecisionProfile({ kind: 'command', detail: 'git push origin main' })
    expect(p.basis.length).toBeGreaterThan(0)
    expect(p.basis.join()).toContain('one-way')
  })

  it('评审/看板：资金收付动作与个人数据类别词 → high（B4 2026-11-28；业务域名词不收、命令面不动）', () => {
    // 资金动作词：文章例「自动付款 Agent」此前恒 medium（unknown 可逆性、单签 ask）
    expect(classifyDecisionProfile({ kind: 'kanban', title: '自动付款 Agent 隔离验证' }))
      .toMatchObject({ riskTier: 'high', reversibility: 'unknown' })
    // 只命中「退款」，不与 HIGH_SEMANTIC 的「上线」等词重叠——否则删词探针抓不到
    expect(classifyDecisionProfile({ kind: 'review', title: '退款审核流程' }))
      .toMatchObject({ riskTier: 'high' })
    // 敏感数据类别词
    expect(classifyDecisionProfile({ kind: 'kanban', title: '个人信息导出工具' }))
      .toMatchObject({ riskTier: 'high' })
    expect(classifyDecisionProfile({ kind: 'kanban', title: '客户信息脱敏脚本' }))
      .toMatchObject({ riskTier: 'high' })
    // 业务域名词不收：这块板叫 pay，域名词命中等于按部门贴高危标签（存量实测「支付」143 条、93 条来自 pay 板）
    expect(classifyDecisionProfile({ kind: 'kanban', title: '支付渠道接入' }).riskTier).toBe('medium')
    expect(classifyDecisionProfile({ kind: 'kanban', title: '结算对账日报' }).riskTier).toBe('medium')
    // 命令面不动：检索「退款」仍是只读命令判低、写支付模块的脚本仍是写副作用判中——都不得因词面升 high
    expect(classifyDecisionProfile({ kind: 'command', detail: 'grep 退款 src/pay' }).riskTier).toBe('low')
    expect(classifyDecisionProfile({ kind: 'command', detail: 'node scripts/refund-batch.js' }).riskTier).toBe('medium')
  })

  it('评审/看板：HIGH_SEMANTIC 同判据定 risk；不可证明 → unknown；语义命中对外词表照记', () => {
    expect(classifyDecisionProfile({ kind: 'review', title: '发布准出检查' }))
      .toMatchObject({ riskTier: 'high', reversibility: 'one-way', externalEffect: false })
    expect(classifyDecisionProfile({ kind: 'review', title: '评审 · t_100', detail: '基线对照 main', domain: 'baseline' }))
      .toMatchObject({ riskTier: 'medium', reversibility: 'unknown', externalEffect: false })
    expect(classifyDecisionProfile({ kind: 'kanban', title: '生产环境发版审批' }))
      .toMatchObject({ riskTier: 'high', reversibility: 'one-way', externalEffect: false })
    expect(classifyDecisionProfile({ kind: 'kanban', title: '上传物料给供应商' }))
      .toMatchObject({ riskTier: 'medium', reversibility: 'unknown', externalEffect: true })
    expect(classifyDecisionProfile({ kind: 'kanban' }))
      .toMatchObject({ riskTier: 'medium', reversibility: 'unknown', externalEffect: false })
  })
})

describe('combineProfiles 只调严语义', () => {
  it('调松三例：降 risk／退 reversibility／撤 external 一律忽略并记 basis', () => {
    const loosened = combineProfiles(
      profile('high', 'one-way', true),
      profile('low', 'reversible', false),
    )
    expect(loosened).toMatchObject({ riskTier: 'high', reversibility: 'one-way', externalEffect: true })
    expect(loosened.basis.join()).toContain('risk-loosen-ignored')
    expect(loosened.basis.join()).toContain('reversibility-loosen-ignored')
    expect(loosened.basis.join()).toContain('external-effect-unset-ignored')

    // costly→reversible 同为调松
    const r = combineProfiles(profile('medium', 'costly', false), profile('medium', 'reversible', false))
    expect(r.reversibility).toBe('costly')
    expect(r.basis.join()).toContain('reversibility-loosen-ignored')
  })

  it('调严三例：升 risk／收 reversibility／置 external 生效并记 basis', () => {
    const tightened = combineProfiles(
      profile('low', 'reversible', false),
      profile('medium', 'one-way', true),
    )
    expect(tightened).toMatchObject({ riskTier: 'medium', reversibility: 'one-way', externalEffect: true })
    expect(tightened.basis.join()).toContain('risk-raised')
    expect(tightened.basis.join()).toContain('reversibility-tightened')
    expect(tightened.basis.join()).toContain('external-effect-set')
  })

  it('unknown：auto=unknown 冻结不动（declared one-way 也不改）；declared=unknown 对已知值忽略', () => {
    const frozen = combineProfiles(profile('medium', 'unknown', false), profile('high', 'one-way', true))
    expect(frozen.reversibility).toBe('unknown')
    expect(frozen.riskTier).toBe('high') // risk 维照常调严
    expect(frozen.externalEffect).toBe(true)
    expect(frozen.basis.join()).toContain('unknown-frozen')

    const declaredUnknown = combineProfiles(profile('low', 'reversible', false), profile('low', 'unknown', false))
    expect(declaredUnknown.reversibility).toBe('reversible')
    expect(declaredUnknown.basis.join()).toContain('reversibility-unknown-ignored')
  })

  it('declared 缺省：原样返回（新对象，不共享 basis 数组）', () => {
    const auto = profile('low', 'reversible', false)
    auto.basis.push('risk-tier:low')
    const out = combineProfiles(auto)
    expect(out).toMatchObject({ riskTier: 'low', reversibility: 'reversible', externalEffect: false })
    expect(out).not.toBe(auto)
    out.basis.push('x')
    expect(auto.basis).toEqual(['risk-tier:low'])
  })

  it('等值声明：既非调严也非调松，静默保持', () => {
    const out = combineProfiles(profile('medium', 'costly', true), profile('medium', 'costly', true))
    expect(out).toMatchObject({ riskTier: 'medium', reversibility: 'costly', externalEffect: true })
    expect(out.basis.join()).not.toContain('ignored')
  })
})

describe('evaluateOutcomeAction 矩阵与 decidedBy/rule', () => {
  it('mode=plan：一律 deny（decidedBy=policy:plan-readonly，先于矩阵——双签格也不进 plan）', () => {
    const d = evaluateOutcomeAction({ mode: 'plan', profile: profile('low', 'reversible', false) })
    expect(d).toMatchObject({ action: 'deny', dualSignRequired: false, decidedBy: 'policy:plan-readonly' })
    const dual = evaluateOutcomeAction({ mode: 'plan', profile: profile('high', 'one-way', false) })
    expect(dual).toMatchObject({ action: 'deny', dualSignRequired: false })
  })

  it('high+one-way：ask+dualSign（三挡一致）', () => {
    for (const mode of ['build', 'guarded', 'yolo'] as const) {
      const d = evaluateOutcomeAction({ mode, profile: profile('high', 'one-way', false) })
      expect(d, mode).toMatchObject({ action: 'ask', dualSignRequired: true })
      expect(d.dualSignRequired, mode).toBe(true)
    }
  })

  it('medium|costly：build=ask、guarded/yolo=allow（decidedBy=policy:risk-evaluated）', () => {
    const b = evaluateOutcomeAction({ mode: 'build', profile: profile('medium', 'reversible', false) })
    expect(b).toMatchObject({ action: 'ask', decidedBy: 'policy:risk-evaluated' })
    for (const mode of ['guarded', 'yolo'] as const) {
      const d = evaluateOutcomeAction({ mode, profile: profile('medium', 'costly', false) })
      expect(d, mode).toMatchObject({ action: 'allow', decidedBy: 'policy:risk-evaluated' })
    }
    // costly 在 build 同样 ask
    expect(evaluateOutcomeAction({ mode: 'build', profile: profile('low', 'costly', false) }).action).toBe('ask')
  })

  it('low+reversible+无外部影响：allow', () => {
    for (const mode of ['build', 'guarded', 'yolo'] as const) {
      const d = evaluateOutcomeAction({ mode, profile: profile('low', 'reversible', false) })
      expect(d.action, mode).toBe('allow')
    }
  })

  it('未知挡 fail-closed=ask（不猜 allow/deny）', () => {
    const d = evaluateOutcomeAction({ mode: 'unknown-mode', profile: profile('low', 'reversible', false) })
    expect(d).toMatchObject({ action: 'ask', dualSignRequired: false })
  })
})
