// overlay/custom/server/approvals/__tests__/risk-tier.test.ts
// V4-N1 审批风险分级守门：三档分类矩阵（高危不可逆/可逆常规/低风险只读）+
// 保守性（拿不准=medium）+ 语义关键词（发布/准出/release）。
import { describe, it, expect } from 'vitest'
import { classifyApprovalRisk, isApprovalRiskTier } from '../risk-tier'

describe('审批风险分级（risk-tier）', () => {
  it('高危：push/rm/发布/杀进程/删库/改部署 一律 high', () => {
    const highs = [
      'git push origin main',
      'git push --force origin feat/x',
      'git reset --hard HEAD~3',
      'git clean -fd',
      'rm -rf node_modules',
      'rm dist.zip',
      'npm publish',
      'docker rm -f matrix-synapse',
      'docker system prune -a',
      'docker-compose down',
      'kill 9231',
      'pkill -f vite',
      'kubectl delete pod web-0',
      'helm uninstall prod-release',
      'drop table payments',
      '执行发布流水线到生产环境',
      '部署新版本上线',
    ]
    for (const detail of highs) {
      expect(classifyApprovalRisk({ kind: 'command', detail }), detail).toBe('high')
    }
  })

  it('低风险：只读命令一律 low（git 只读子命令/查询工具/版本查询）', () => {
    const lows = [
      'ls -la',
      'pwd',
      'cat package.json',
      'grep -rn raci src/',
      'rg TODO',
      'find . -name "*.ts"',
      'git status',
      'git log --oneline -5',
      'git diff HEAD',
      'git show abc123',
      'git branch',
      'git remote -v',
      'git rev-parse HEAD',
      'npm ls',
      'pnpm outdated',
      'node --version',
      'python3 -V',
      'echo hello',
      'jq .data package.json',
    ]
    for (const detail of lows) {
      expect(classifyApprovalRisk({ kind: 'command', detail }), detail).toBe('low')
    }
  })

  it('常规可逆：写文件/构建/测试/commit/安装依赖 默认 medium', () => {
    const mediums = [
      'git commit -m "feat: x"',
      'git checkout -b feat/x',
      'npm test',
      'npm run build',
      'npm install lodash',
      'node scripts/build.mjs',
      'python3 manage.py migrate',
      'touch new-file.ts',
      'mv a.ts b.ts',
    ]
    for (const detail of mediums) {
      expect(classifyApprovalRisk({ kind: 'command', detail }), detail).toBe('medium')
    }
  })

  it('保守性：空 detail / 无法识别 一律 medium（不低判高危、不高判只读）', () => {
    expect(classifyApprovalRisk({ kind: 'command', detail: '' })).toBe('medium')
    expect(classifyApprovalRisk({ kind: 'command' })).toBe('medium')
    expect(classifyApprovalRisk({ kind: 'command', detail: 'some-custom-tool --frobnicate' })).toBe('medium')
  })

  it('评审/看板：发布准出语义 high；普通评审 medium', () => {
    expect(classifyApprovalRisk({ kind: 'review', title: '评审 · t_rel', detail: '发布准出检查' })).toBe('high')
    expect(classifyApprovalRisk({ kind: 'review', title: 'release gate review' })).toBe('high')
    expect(classifyApprovalRisk({ kind: 'review', title: '评审 · t_100', detail: '基线对照 main', domain: 'baseline' })).toBe('medium')
    expect(classifyApprovalRisk({ kind: 'kanban', title: '支付渠道接入' })).toBe('medium')
    expect(classifyApprovalRisk({ kind: 'kanban', title: '生产环境发版审批' })).toBe('high')
  })

  it('git 写操作不落 low（branch -d / checkout -b / stash push）', () => {
    expect(classifyApprovalRisk({ kind: 'command', detail: 'git branch -d feat/old' })).toBe('medium')
    expect(classifyApprovalRisk({ kind: 'command', detail: 'git checkout -b feat/x' })).toBe('medium')
    expect(classifyApprovalRisk({ kind: 'command', detail: 'git stash push -m wip' })).toBe('medium')
  })

  it('isApprovalRiskTier 词表校验', () => {
    expect(isApprovalRiskTier('high')).toBe(true)
    expect(isApprovalRiskTier('medium')).toBe(true)
    expect(isApprovalRiskTier('low')).toBe(true)
    expect(isApprovalRiskTier('critical')).toBe(false)
    expect(isApprovalRiskTier(undefined)).toBe(false)
  })
})

// run2 探针实锤的 git 全局旗标盲区（2026-09-29 修复守门）
describe('git 全局旗标剥除（-C/-c/--git-dir）', () => {
  it('git -C <path> status → low（只读不因首词 -C 误判 medium）', async () => {
    const { classifyApprovalRisk } = await import('../risk-tier')
    expect(classifyApprovalRisk({ kind: 'command', detail: 'git -C /Volumes/repo status --short' })).toBe('low')
    expect(classifyApprovalRisk({ kind: 'command', detail: 'git -c core.pager=cat log --oneline' })).toBe('low')
  })
  it('安全向：git -C <path> push 不再绕过高危正则 → high', async () => {
    const { classifyApprovalRisk } = await import('../risk-tier')
    expect(classifyApprovalRisk({ kind: 'command', detail: 'git -C /Volumes/repo push origin main' })).toBe('high')
    expect(classifyApprovalRisk({ kind: 'command', detail: 'git --git-dir=/x/.git push' })).toBe('high')
    expect(classifyApprovalRisk({ kind: 'command', detail: 'git -C /repo reset --hard HEAD~1' })).toBe('high')
  })
  it('旗标剥除不越权：未知旗标后的写子命令仍 medium+', async () => {
    const { classifyApprovalRisk } = await import('../risk-tier')
    expect(classifyApprovalRisk({ kind: 'command', detail: 'git branch -D main' })).toBe('medium')
  })
})
