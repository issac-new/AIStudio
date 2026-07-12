// overlay/custom/server/loop/connectors/local-git-connector.ts
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { LoopInstance, TaskContract } from '../types'
import { createContract } from '../engine/task-contract'

const execFileAsync = promisify(execFile)

export class LocalGitConnector {
  constructor(private cwd: string = process.cwd()) {}

  async discover(loop: LoopInstance): Promise<TaskContract[]> {
    const contracts: TaskContract[] = []
    const unpushed = await this.getUnpushedCommits()
    for (const commit of unpushed) {
      contracts.push(createContract({
        loopId: loop.id,
        source: { type: 'git-commit', ref: commit.sha, summary: `Unpushed: ${commit.message}`, rawPayload: commit },
        readPlan: { requiredReads: [] },
        writeBoundary: [],
        verificationIntent: { programmatic: [], judge: null, human: null },
        resultTemplate: { artifactType: 'report', requiredFiles: [] },
      }))
    }
    return contracts
  }

  private async getUnpushedCommits(): Promise<Array<{ sha: string; message: string }>> {
    try {
      const { stdout } = await execFileAsync('git', ['log', '--oneline', '-10', '--format=%H%n%s', '@{u}..HEAD'], { cwd: this.cwd })
      if (!stdout.trim()) return []
      const lines = stdout.trim().split('\n')
      const commits: Array<{ sha: string; message: string }> = []
      for (let i = 0; i < lines.length; i += 2) {
        if (lines[i]) commits.push({ sha: lines[i], message: lines[i + 1] ?? '' })
      }
      return commits
    } catch { return [] } // no upstream → empty
  }
}
