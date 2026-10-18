// overlay/custom/client/ide/i18n.ts
// IDE 本地字典单一事实源（不在上游 locale 补丁里的运行期文案）。
// 2026-10-18 深度重构 P2-2：分组名/页签名/工作流状态集中，避免组件各写一份。
export type IdeLocale = 'zh' | 'en'

export const IDE_LOCAL_TEXT = {
  zh: {
    groups: {
      all: '全部', code: '编码', knowledge: '知识', observe: '观测', collab: '协作', config: '工具与配置',
    },
    panes: {
      files: '查看文件', review: '代码审查', terminal: '终端', wiki: 'Wiki', memory: '记忆',
      ctxarchive: '上下文档案', tools: '工具时间线', trajectory: '轨迹', workflow: '工作流',
      kanban: '看板', assistant: '辅助对话', board: '白板', browser: '浏览器',
      storage: '资源管理器', mcp: 'MCP', hooks: 'Hooks', slash: '自定义命令',
    },
    workflowStatus: {
      queued: '排队中', pending: '排队中', running: '运行中', completed: '已完成', errored: '失败', stopped: '已停止',
    },
    selfCheck: 'IDE 自检（全能力冒烟）',
  },
  en: {
    groups: {
      all: 'All', code: 'Code', knowledge: 'Knowledge', observe: 'Observe', collab: 'Collab', config: 'Tools',
    },
    panes: {
      files: 'Files', review: 'Review', terminal: 'Terminal', wiki: 'Wiki', memory: 'Memory',
      ctxarchive: 'Context Archive', tools: 'Tool Timeline', trajectory: 'Trajectory', workflow: 'Workflow',
      kanban: 'Kanban', assistant: 'Ask', board: 'Whiteboard', browser: 'Browser',
      storage: 'Storage', mcp: 'MCP', hooks: 'Hooks', slash: 'Commands',
    },
    workflowStatus: {
      queued: 'Queued', pending: 'Queued', running: 'Running', completed: 'Completed', errored: 'Failed', stopped: 'Stopped',
    },
    selfCheck: 'IDE self-check (full smoke)',
  },
} as const

export function ideLocaleOf(locale: unknown): IdeLocale {
  return String((locale as { value?: string } | undefined)?.value ?? locale ?? 'zh').startsWith('en') ? 'en' : 'zh'
}
