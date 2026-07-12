// overlay/custom/server/loop/connectors/github-connector.ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { LoopInstance, TaskContract } from '../types'
import { createContract } from '../engine/task-contract'

const execFileAsync = promisify(execFile)

export interface GithubConnectorConfig {
  repo: string        // 'owner/repo'
  token?: string      // GitHub PAT
  apiUrl?: string     // default: https://api.github.com
}

export class GithubConnector {
  constructor(private config: GithubConnectorConfig) {}

  async discover(loop: LoopInstance): Promise<TaskContract[]> {
    const contracts: TaskContract[] = []
    // Probe repo reachability via the issues endpoint. A null return means the
    // configured repo is invalid/unreachable — we surface nothing in that case
    // (including local commits), so callers see an empty discovery signal.
    const issues = await this.fetchOpenIssues()
    if (issues === null) return []
    const [ciFails, recentCommits] = await Promise.all([
      this.fetchCIFailures(),
      this.fetchRecentCommits(),
    ])
    for (const issue of issues) {
      contracts.push(createContract({
        loopId: loop.id,
        source: { type: 'github-issue', ref: `#${issue.number}`, summary: issue.title, rawPayload: issue },
        readPlan: { requiredReads: ['packages/**'] },
        writeBoundary: ['packages/**'],
        verificationIntent: { programmatic: [], judge: null, human: null },
        resultTemplate: { artifactType: 'patch', requiredFiles: [] },
      }))
    }
    for (const ci of ciFails) {
      contracts.push(createContract({
        loopId: loop.id,
        source: { type: 'github-ci', ref: ci.workflowName, summary: `CI failure: ${ci.workflowName}`, rawPayload: ci },
        readPlan: { requiredReads: ['.github/workflows/**'] },
        writeBoundary: ['.github/workflows/**', 'packages/**'],
        verificationIntent: { programmatic: [], judge: null, human: null },
        resultTemplate: { artifactType: 'patch', requiredFiles: [] },
      }))
    }
    for (const commit of recentCommits) {
      contracts.push(createContract({
        loopId: loop.id,
        source: { type: 'git-commit', ref: commit.sha, summary: commit.message, rawPayload: commit },
        readPlan: { requiredReads: [] },
        writeBoundary: [],
        verificationIntent: { programmatic: [], judge: null, human: null },
        resultTemplate: { artifactType: 'report', requiredFiles: [] },
      }))
    }
    return contracts
  }

  // Returns null when the repo is unreachable/invalid (so callers can short-
  // circuit discovery); returns [] when the repo is reachable but has no open
  // issues.
  private async fetchOpenIssues(): Promise<Array<{ number: number; title: string }> | null> {
    try {
      const url = `${this.config.apiUrl ?? 'https://api.github.com'}/repos/${this.config.repo}/issues?state=open`
      const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' }
      if (this.config.token) headers['Authorization'] = `Bearer ${this.config.token}`
      const res = await fetch(url, { headers })
      if (!res.ok) return null
      const data = await res.json()
      return (data as any[]).map(i => ({ number: i.number, title: i.title }))
    } catch { return null }
  }

  private async fetchCIFailures(): Promise<Array<{ workflowName: string; runId: number }>> {
    try {
      const url = `${this.config.apiUrl ?? 'https://api.github.com'}/repos/${this.config.repo}/actions/runs?status=failure&per_page=5`
      const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' }
      if (this.config.token) headers['Authorization'] = `Bearer ${this.config.token}`
      const res = await fetch(url, { headers })
      if (!res.ok) return []
      const data = await res.json()
      return (data.workflow_runs ?? []).map((r: any) => ({ workflowName: r.name, runId: r.id }))
    } catch { return [] }
  }

  private async fetchRecentCommits(): Promise<Array<{ sha: string; message: string }>> {
    try {
      const { stdout } = await execFileAsync('git', ['log', '--oneline', '-5', '--format=%H%n%s'])
      return stdout.trim().split('\n').reduce((acc: Array<{ sha: string; message: string }>, line, i) => {
        if (i % 2 === 0 && line) {
          acc.push({ sha: line, message: stdout.split('\n')[i + 1] ?? '' })
        }
        return acc
      }, [])
    } catch { return [] }
  }
}
