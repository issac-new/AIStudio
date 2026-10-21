// overlay/secaudit 域：存储（单文件 JSON，原子写；env 可覆写供测试）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { AuditProject } from './types'

interface SecAuditStoreShape {
  projects: AuditProject[]
}

const EMPTY: SecAuditStoreShape = { projects: [] }

export function secAuditStorePath(): string {
  const env = process.env.SECAUDIT_STORE?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes-web-ui', 'secaudit', 'secaudit-store.json')
}

export function readSecAuditStore(): SecAuditStoreShape {
  const file = secAuditStorePath()
  if (!existsSync(file)) return structuredClone(EMPTY)
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<SecAuditStoreShape>
    return { projects: Array.isArray(raw.projects) ? raw.projects : [] }
  } catch {
    return structuredClone(EMPTY)
  }
}

export function writeSecAuditStore(store: SecAuditStoreShape): void {
  const file = secAuditStorePath()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(store, null, 1), 'utf8')
  renameSync(tmp, file)
}

export function getProject(projectId: string): AuditProject | undefined {
  return readSecAuditStore().projects.find((p) => p.projectId === projectId)
}

export function listProjects(): AuditProject[] {
  return readSecAuditStore().projects
}

export function saveProject(project: AuditProject): void {
  const store = readSecAuditStore()
  const idx = store.projects.findIndex((p) => p.projectId === project.projectId)
  if (idx >= 0) store.projects[idx] = project
  else store.projects.push(project)
  writeSecAuditStore(store)
}

export function deleteProject(projectId: string): boolean {
  const store = readSecAuditStore()
  const before = store.projects.length
  store.projects = store.projects.filter((p) => p.projectId !== projectId)
  if (store.projects.length === before) return false
  writeSecAuditStore(store)
  return true
}

/** 测试隔离：清空存储（不写盘）。 */
export function _useSecAuditStoreForTests(path: string): void {
  process.env.SECAUDIT_STORE = path
}
