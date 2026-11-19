#!/usr/bin/env node
// 能力注册表种子（批二点五 Task 4）
//
// 从既有事实源生成 agent-capabilities.md 的候选行：
//   team/shared/profiles.yaml              → 每 profile 的技能声明
//   team/shared/capability-graph.yaml      → 每 Agent 的能力标签与可靠性
//   team/shared/role-tool-matrix.yaml      → profile → 角色
//   team/profiles/_shared/skill-provisioning.json → 角色 → 技能（精确 match 时优先）
//
// 纪律：只写有证据的声明；未声明写 unknown，不填默认能力。四维边界按角色矩阵映射，
// 属治理策略而非制品内容；不确定的角色一律 generic，不猜 deliverable-kinds。
// 默认 dry-run（stdout）；--write 才落盘，--out 指定路径。
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const ROLE_TEMPLATE = {
  coder: 'dev',
  tester: 'tester',
  researcher: 'analyst',
  orchestrator: 'governance',
  product: 'analyst',
  ops: 'generic',
  data: 'dev',
  security: 'reviewer',
}

const DELIVERABLE_KINDS = {
  dev: 'code,test-report',
  tester: 'test-report',
  analyst: 'doc,report',
  governance: 'doc,report,verdict',
  reviewer: 'verdict',
  generic: '',
}

const VCS_SCOPE = {
  dev: 'own-branch-only',
  tester: 'none',
  analyst: 'main-docs-only',
  governance: 'main-docs-only',
  reviewer: 'none',
  generic: '',
}

function list(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []
}

function joinOrUnknown(values) {
  const cleaned = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))]
  return cleaned.length > 0 ? cleaned.join(',') : 'unknown'
}

function exactRoleSkills(profile, skillProvisioning) {
  const roles = Array.isArray(skillProvisioning?.roles) ? skillProvisioning.roles : []
  const hit = roles.find((role) => role?.match === profile)
  return hit ? list(hit.skills) : []
}

/**
 * 纯函数：从四份事实源的文本生成注册表 markdown。
 * 返回 { markdown, rows, stats }；重复调用确定性一致（幂等）。
 */
export function buildRegistrySeed(input) {
  const profilesDoc = parse(input.profilesYaml ?? '') ?? {}
  const graphDoc = parse(input.graphYaml ?? '') ?? {}
  const roleDoc = parse(input.roleMatrixYaml ?? '') ?? {}
  const skillProvisioning = JSON.parse(input.skillProvisioningJson ?? '{}')

  const profiles = profilesDoc.profiles && typeof profilesDoc.profiles === 'object' ? profilesDoc.profiles : {}
  const agents = Array.isArray(graphDoc.nodes?.agents) ? graphDoc.nodes.agents : []
  const profileRoles = roleDoc.profile_roles && typeof roleDoc.profile_roles === 'object' ? roleDoc.profile_roles : {}

  const graphByName = new Map()
  for (const agent of agents) {
    if (agent && typeof agent.name === 'string' && agent.name.trim()) graphByName.set(agent.name.trim(), agent)
  }

  const names = [...new Set([...Object.keys(profiles), ...graphByName.keys(), ...Object.keys(profileRoles)])].sort()
  const rows = names.map((name) => {
    const profile = profiles[name] ?? {}
    const graph = graphByName.get(name) ?? {}
    const role = String(profileRoles[name] ?? '').trim()
    const roleTemplate = ROLE_TEMPLATE[role] ?? 'generic'
    const capabilities = list(graph.capabilities)
    const profileSkills = [...list(profile.skills_enabled), ...list(profile.skills_pinned)]
    const manifestSkills = exactRoleSkills(name, skillProvisioning)
    const skills = manifestSkills.length > 0 ? manifestSkills : profileSkills
    return {
      assignee: name,
      roleTemplate,
      deliverableKinds: DELIVERABLE_KINDS[roleTemplate] ?? '',
      vcsScope: VCS_SCOPE[roleTemplate] ?? '',
      domainScope: '',
      integrationAuthority: 'none',
      role,
      capabilities: joinOrUnknown(capabilities),
      skills: joinOrUnknown(skills),
      hasCapabilityEvidence: capabilities.length > 0,
    }
  })

  const stats = {
    profiles: rows.length,
    capabilitiesDeclared: rows.filter((row) => row.hasCapabilityEvidence).length,
    capabilitiesUnknown: rows.filter((row) => !row.hasCapabilityEvidence).length,
    roleMapped: rows.filter((row) => row.role !== '').length,
  }

  const header = [
    '# Agent 能力声明注册表（agent-capabilities）',
    '',
    '> 由 `scripts/maintenance/capability-registry-seed.mjs` 从 profiles/能力图/角色矩阵/技能清单生成。',
    '> 只写有证据的声明；未声明写 `unknown`，不填默认能力。四维边界按角色矩阵映射。',
    '',
    '| assignee | role_template | deliverable-kinds | vcs-scope | domain-scope | integration-authority | role | capabilities | skills |',
    '|---|---|---|---|---|---|---|---|---|',
  ]
  const body = rows.map((row) => [
    row.assignee,
    row.roleTemplate,
    row.deliverableKinds || 'unknown',
    row.vcsScope || 'unknown',
    row.domainScope || 'unknown',
    row.integrationAuthority,
    row.role || 'unknown',
    row.capabilities,
    row.skills,
  ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
  return { markdown: [...header, ...body, ''].join('\n'), rows, stats }
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function main() {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const repoArg = args.indexOf('--repo')
  const outArg = args.indexOf('--out')
  const repo = repoArg >= 0 ? resolve(args[repoArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const out = outArg >= 0
    ? resolve(args[outArg + 1])
    : resolve(repo, 'governance/docs/admin/agent-capabilities.md')

  const seed = buildRegistrySeed({
    profilesYaml: readIfExists(resolve(repo, 'team/shared/profiles.yaml')),
    graphYaml: readIfExists(resolve(repo, 'team/shared/capability-graph.yaml')),
    roleMatrixYaml: readIfExists(resolve(repo, 'team/shared/role-tool-matrix.yaml')),
    skillProvisioningJson: readIfExists(resolve(repo, 'team/profiles/_shared/skill-provisioning.json')) || '{}',
  })

  if (write) {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, seed.markdown, 'utf8')
    console.error(`[capability-registry-seed] 已写入 ${out}`)
  } else {
    process.stdout.write(seed.markdown)
  }
  console.error(`[capability-registry-seed] profiles=${seed.stats.profiles} declared=${seed.stats.capabilitiesDeclared} unknown=${seed.stats.capabilitiesUnknown} roleMapped=${seed.stats.roleMapped}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
