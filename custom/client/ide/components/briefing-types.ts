// custom/client/ide/components/briefing-types.ts
// 任务简报面板（TaskBriefingPanel）的入参类型。<script setup> 不可 export，
// 类型集中在此供面板 / IdeShell / 测试共享。
export interface BriefingTask {
  id: string
  title: string
  status: string
  priority?: number
  assignee?: string | null
  body?: string | null
}

export interface BriefingRaci {
  responsible: string[]
  approver: string[]
  consulted: string[]
  informed: string[]
}

export interface BriefingGit {
  branch?: string | null
  worktreePath?: string | null
  commits: { hash: string; subject: string; at?: number }[]
}

export interface BriefingWorkflow {
  stage: string
  parentIds: string[]
  childIds: string[]
  blocked: boolean
  retryCount: number
}

export interface BriefingCollabMessage {
  sender: string
  excerpt: string
  at?: number
}

export interface BriefingRecap {
  summary: string
  decisions: string[]
  blockers: string[]
  todos: string[]
}
