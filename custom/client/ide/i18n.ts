// overlay/custom/client/ide/i18n.ts
// IDE 本地字典单一事实源（不在上游 locale 补丁里的运行期文案）。
// 2026-10-18 深度重构 P2-2：分组名/页签名/工作流状态集中，避免组件各写一份。
// 2026-10-18 立查立改：自检弹层/文件根校验/存储缓存/错误分级补英文对照。
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
    // ZCode 输入框对齐批（2026-10-18）：composer 工具条五控件 + 模型面板入口文案。
    composer: {
      mode: '模式', computerUse: '电脑操作', contextUsage: '上下文容量',
      modelSelect: '选择模型', thinkLevel: '思考强度', manageModels: '管理模型…',
      autoRoute: '⚡ Auto（复杂度路由）',
      autoTitle: '按任务复杂度选成本档（0.5×/1×/2×）——判定理由见点击后提示',
      computerUseTip: '开启后向当前会话声明允许电脑操作/浏览器控制（声明式，实际能力以会话工具面为准；引擎 CUA 插件通道未接）',
    },
    selfCheckCommand: 'IDE 自检（全能力冒烟）',
    selfCheck: {
      title: 'IDE 全能力自检',
      rerun: '重新自检',
      copy: '复制报告',
      copied: '已复制',
      running: '自检中…',
      notRun: '尚未运行',
      runningList: '正在运行…',
      close: '✕',
      hint: '只读探针：不修改会话/仓库/配置；存储扫描与工作流引擎依赖当前环境。',
      pass: '通过', warn: '告警', fail: '失败',
      reportHead: (pass: number, warn: number, fail: number, total: number) =>
        `IDE 自检：${pass} 通过 / ${warn} 告警 / ${fail} 失败（共 ${total}）`,
      label: {
        'session-store': '会话库装载', 'active-session': '活动会话', workspace: '工作区绑定',
        'deep-link': '会话深链解析', 'side-pane': '辅助页签注册', i18n: '文案完整性',
        files: '文件列表 API', git: 'Git 状态 API', storage: '资源管理器 API',
        slash: '斜杠命令 API', automations: '自动化 API', 'engine-models': '模型目录 API',
        workflow: '工作流 API（引擎）', 'context-archive': '上下文档案 API', worktree: 'Worktree API',
      },
      detail: {
        skipNoWorkspace: '跳过：无工作区', timeout: (ms: number) => `超时（>${ms}ms）`,
        sessionEmpty: '会话库为空；可从历史导入或新建任务',
        noActiveSession: '无活动会话（裸落地草稿态）',
        noWorkspace: '未绑定工作区；文件/Git/终端能力受限',
        noSessionToVerify: '无活动会话可验证',
        deepLinkOk: '?session= 可解析到当前会话', deepLinkMiss: '深链解析未命中',
        rawKeys: (n: number) => `${n} 个裸键（如 ide.xxx）`,
        notRepo: '非 Git 仓库（面板显示 not_a_repo 是诚实态）',
        engineOffline: '工作流引擎未启动（127.0.0.1:3030）；启动引擎后点刷新',
      },
    },
    filesInvalid: {
      title: (msg: string) => `工作区不可用：${msg || '路径不在允许范围内'}`,
      fallback: '路径不在允许范围内', retry: '重试',
    },
    storage: {
      cached: '缓存', cachedTitle: '磁盘缓存，后台刷新中',
    },
    errors: {
      auth: '登录态失效，请重新登录', forbidden: '没有权限访问该资源',
      notFound: '资源不存在', unavailable: '依赖服务未启动或暂不可用',
      engineOffline: '依赖服务未启动（工作流引擎）', timeout: '请求超时，请稍后重试',
      server: (status: number) => `服务端错误（HTTP ${status}）`,
      generic: (status: number) => `请求失败（HTTP ${status}）`,
      network: '网络连接失败', notRepo: '当前目录不是 Git 仓库', fallback: '请求失败',
    },
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
    composer: {
      mode: 'Mode', computerUse: 'Computer Use', contextUsage: 'Context',
      modelSelect: 'Select model', thinkLevel: 'Think', manageModels: 'Manage models…',
      autoRoute: '⚡ Auto (complexity routing)',
      autoTitle: 'Pick a cost tier by task complexity (0.5×/1×/2×) — rationale shown after click',
      computerUseTip: 'When on, declares computer-use/browser-control allowed to the session (declarative; actual capability depends on session tools; engine CUA plugin channel not wired)',
    },
    selfCheckCommand: 'IDE self-check (full smoke)',
    selfCheck: {
      title: 'IDE full-capability self-check',
      rerun: 'Re-run', copy: 'Copy report', copied: 'Copied',
      running: 'Running…', notRun: 'Not run yet', runningList: 'Running…', close: '✕',
      hint: 'Read-only probes: no session/repo/config changes. Storage scan and workflow engine depend on the environment.',
      pass: 'Pass', warn: 'Warn', fail: 'Fail',
      reportHead: (pass: number, warn: number, fail: number, total: number) =>
        `IDE self-check: ${pass} pass / ${warn} warn / ${fail} fail (of ${total})`,
      label: {
        'session-store': 'Session store', 'active-session': 'Active session', workspace: 'Workspace binding',
        'deep-link': 'Session deep link', 'side-pane': 'Side pane tabs', i18n: 'Copy integrity',
        files: 'Files API', git: 'Git status API', storage: 'Storage API',
        slash: 'Slash commands API', automations: 'Automations API', 'engine-models': 'Model catalog API',
        workflow: 'Workflow API (engine)', 'context-archive': 'Context archive API', worktree: 'Worktree API',
      },
      detail: {
        skipNoWorkspace: 'Skipped: no workspace', timeout: (ms: number) => `Timeout (>${ms}ms)`,
        sessionEmpty: 'Session store is empty; import history or create a task',
        noActiveSession: 'No active session (bare-landing draft)',
        noWorkspace: 'No workspace bound; files/Git/terminal are limited',
        noSessionToVerify: 'No active session to verify',
        deepLinkOk: '?session= resolves to the current session', deepLinkMiss: 'Deep link did not match',
        rawKeys: (n: number) => `${n} raw key(s) (e.g. ide.xxx)`,
        notRepo: 'Not a git repo (panel shows not_a_repo honestly)',
        engineOffline: 'Workflow engine not running (127.0.0.1:3030); start it and refresh',
      },
    },
    filesInvalid: {
      title: (msg: string) => `Workspace unavailable: ${msg || 'path outside the allowed scope'}`,
      fallback: 'path outside the allowed scope', retry: 'Retry',
    },
    storage: {
      cached: 'Cached', cachedTitle: 'Disk cache; refreshing in background',
    },
    errors: {
      auth: 'Session expired, please sign in again', forbidden: 'No permission for this resource',
      notFound: 'Resource not found', unavailable: 'Dependency not running or unavailable',
      engineOffline: 'Dependency not running (workflow engine)', timeout: 'Request timed out, retry later',
      server: (status: number) => `Server error (HTTP ${status})`,
      generic: (status: number) => `Request failed (HTTP ${status})`,
      network: 'Network connection failed', notRepo: 'Current directory is not a git repo', fallback: 'Request failed',
    },
  },
} as const

export function ideLocaleOf(locale: unknown): IdeLocale {
  return String((locale as { value?: string } | undefined)?.value ?? locale ?? 'zh').startsWith('en') ? 'en' : 'zh'
}
