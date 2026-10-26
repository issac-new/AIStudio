// overlay[client] patch 680 语义锁定测试（2026-10-23 Provider 提示误报修复）。
//
// 场景来自用户报障：网关默认使用 orchestrator profile（default 闲置），
// 弹窗却报「Profile default 未配置任何大模型 Provider」。修复后检测对象=
// GET /kanban/orchestration 的 resolved_orchestrator_profile；端点失败
// （含 403 权限拒绝——admin 账号看不到 orchestrator）fail-soft 静默不弹。
// 本测试用静态源码断言锁定三件事（组件在 upstream，不能 import 挂载测试）：
//   1. 检测对象不再直接用 profilesStore.activeProfileName（防回退）；
//   2. gatewayProfile 消费 resolved_orchestrator_profile 且 fail-soft 回落；
//   3. 弹窗文案与 dismissed key 锚 checkedProfile（网关实际 profile）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { UPSTREAM_ROOT } from '../../test/upstream-root'

// upstream 根定位：与 vitest.config.ts 的 upstreamRoot 推导同款（env 优先，
// 缺省 overlay 根上溯 ../upstream；worktree 内符号链接回 .claude/worktrees/upstream
// 也指向共享树）。组件已由 patch 680 注入共享树。
const upstreamRoot = UPSTREAM_ROOT
const component = readFileSync(
  resolve(upstreamRoot, 'hermes-studio/packages/client/src/components/hermes/models/ProviderConfigurationPrompt.vue'),
  'utf8',
)

describe('patch 680：Provider 提示检测对象=网关实际 profile', () => {
  it('检测走 gatewayProfile()（消费 resolved_orchestrator_profile，fail-soft 回落）', () => {
    expect(component).toContain('const profile = await gatewayProfile()')
    expect(component).toContain('resolved_orchestrator_profile')
    expect(component).toMatch(/catch[\s\S]{0,120}activeProfileName \|\| 'default'/)
  })

  it('判定不再直接依赖全局 providers（独立查询 + moa 过滤口径一致）', () => {
    expect(component).toContain('fetchAvailableModelsForProfile(profile)')
    expect(component).toContain("g.provider !== 'moa'")
    expect(component).not.toMatch(/show\.value = modelsStore\.providers\.length === 0/)
  })

  it('弹窗文案与 dismissed key 均锚 checkedProfile（不再报闲置 default）', () => {
    expect(component).toContain("t('models.noProviderPromptMessage', { profile: checkedProfile })")
    expect(component).not.toContain("{ profile: profilesStore.activeProfileName }")
    expect(component).toMatch(/dismissedProfiles\.add\(checkedProfile\.value\)/)
  })
})
