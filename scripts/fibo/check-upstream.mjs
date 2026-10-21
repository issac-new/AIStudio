#!/usr/bin/env node
/**
 * FIBO 季度漂移检查（P2-3 / P4 运营化）。
 *
 * 读死锁文件（ontology-fibo-lock.ts）里的 tag/commit，和 GitHub 最新 release 对账。
 * 只读，不改包；发现新版本时打印升级清单，退出码 1（便于 CI/巡检）。
 *
 * 用法：node scripts/fibo/check-upstream.mjs
 * 退出码：0 同版本；1 有漂移；2 网络/解析失败。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(new URL('../..', import.meta.url).pathname)
const lockFile = resolve(repoRoot, 'custom/server/ontology/ontology-fibo-lock.ts')

function readLock() {
  const text = readFileSync(lockFile, 'utf8')
  const tag = /tag:\s*'([^']+)'/.exec(text)?.[1]
  const commit = /commit:\s*'([0-9a-f]{40})'/.exec(text)?.[1]
  const releasedAt = /releasedAt:\s*'([^']+)'/.exec(text)?.[1]
  if (!tag || !commit) throw new Error('锁文件缺 tag/commit')
  return { tag, commit, releasedAt }
}

async function githubJson(path) {
  const res = await fetch(`https://api.github.com/repos/edmcouncil/fibo${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'swarmstudio-fibo-check' },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`)
  return res.json()
}

async function main() {
  const lock = readLock()
  console.log('## FIBO 上游漂移检查')
  console.log(`- 锁文件：${lock.tag}（${lock.releasedAt ?? '未知发布日期'}）`)
  console.log(`- 固定提交：${lock.commit}`)

  const latest = await githubJson('/releases/latest')
  const tag = String(latest.tag_name ?? '')
  if (!tag) throw new Error('最新 release 无 tag_name')
  const commitInfo = await githubJson(`/commits/${encodeURIComponent(tag)}`)
  const commit = String(commitInfo.sha ?? '')
  console.log(`- 最新发布：${tag}（${latest.published_at ?? '未知发布时间'}）`)
  console.log(`- 最新提交：${commit}`)

  if (tag === lock.tag && commit === lock.commit) {
    console.log('→ 无漂移：锁文件与上游最新正式发布一致。')
    process.exit(0)
  }

  console.log('→ 发现漂移。升级清单：')
  console.log('  1. 下载目标 tag 的受影响模块 RDF，逐模块核对 owl:versionIRI 与 hasMaturityLevel。')
  console.log('  2. 更新 custom/server/ontology/ontology-fibo-lock.ts 的 tag/commit/releasedAt/modules。')
  console.log('  3. 更新 custom/server/ontology/ontology-fibo.ts 的 FIBO_SOURCE 与 FIBO_MODULES。')
  console.log('  4. 跑 ontology-fibo.test.ts、ontology-fibo-gate-consistency.test.ts、ontology-fibo-lock.test.ts。')
  console.log('  5. 生成升级前后 diff 报告，人工确认后合并。')
  process.exit(1)
}

main().catch((e) => {
  console.error(`✗ 检查失败：${e.message}`)
  process.exit(2)
})
