/**
 * delivery-contract — 交付形态感知契约（2026-10-11 平台根治件，run14 严重缺陷的正解层）。
 *
 * 根因回顾：run14 的场景技能（aipaydev-dev）只是实例——真正缺的是生成它的平台层没有
 * 「交付形态」概念：swarm yuan 骨架不按形态约束 DoD、QGate 无形态门、任务协议无运行
 * 证据字段，于是「单测全绿=可运行」的错觉在每个新场景复刻。本模块是**单一事实源**：
 * 交付六型清单×每型运行证据要求，被四方消费——QGate 形态门（gate-packs/delivery/
 * runtime-evidence.yaml）、看板列证据契约（column-automation requiredArtifacts）、
 * swarm yuan 生成器盖章（生成技能时按形态写入 DoD）、hermes 任务书字段（pm-planning）。
 */
export type DeliveryType =
  | 'backend-service'
  | 'web-frontend'
  | 'mini-program'
  | 'mobile-app'
  | 'library-sdk'
  | 'governance-doc'

export interface RuntimeEvidenceSpec {
  /** 证据形态（与 runtime-verify/采集器产物对应） */
  kind: 'devtools-proof' | 'browser-walkthrough' | 'service-smoke' | 'idempotent-exec' | 'none-required'
  /** 证据工件 glob（docs/evidence/ 语境） */
  artifactGlob: string
  description: string
}

export interface DeliveryContract {
  type: DeliveryType
  label: string
  /** 仓库文件标记（detectDeliveryTypes 按路径匹配） */
  markers: string[]
  runtimeEvidence: RuntimeEvidenceSpec
  /** 教学声明：单测全绿≠可运行（run14 实锤：小程序网络层无基址，Node 单测测不到） */
  unitTestsAloneInsufficient: boolean
}

export const DELIVERY_CONTRACTS: Readonly<Record<DeliveryType, DeliveryContract>> = {
  'mini-program': {
    type: 'mini-program',
    label: '小程序（微信/支付宝原生）',
    markers: ['**/*.wxml', '**/*.axml', '**/project.config.json', '**/mini.project.json'],
    runtimeEvidence: {
      kind: 'devtools-proof',
      artifactGlob: 'docs/evidence/*runtime-proof.json',
      description: '真开发者工具自动化通道：编译+启动+首帧（runtime-proof：launchOk/screenshot/checkedAt，POST /api/hermes/runtime-verify/miniprogram）',
    },
    unitTestsAloneInsufficient: true,
  },
  'web-frontend': {
    type: 'web-frontend',
    label: 'Web 前端（浏览器）',
    markers: ['**/index.html', '**/vite.config.*', '**/next.config.*'],
    runtimeEvidence: {
      kind: 'browser-walkthrough',
      artifactGlob: 'docs/evidence/*walkthrough*.png',
      description: '真实浏览器走查帧（构建产物启动+关键路径前后帧）',
    },
    unitTestsAloneInsufficient: true,
  },
  'backend-service': {
    type: 'backend-service',
    label: '后端服务',
    markers: ['**/package.json', '**/src/server*', '**/Dockerfile'],
    runtimeEvidence: {
      kind: 'service-smoke',
      artifactGlob: 'docs/evidence/*smoke*.log',
      description: '服务可启动冒烟（启动日志/健康检查输出）+跨模块契约测试（被消费接口双向实测）',
    },
    unitTestsAloneInsufficient: true,
  },
  'mobile-app': {
    type: 'mobile-app',
    label: '移动应用（iOS/Android）',
    markers: ['**/android/app/build.gradle*', '**/*.xcodeproj/project.pbxproj'],
    runtimeEvidence: {
      kind: 'devtools-proof',
      artifactGlob: 'docs/evidence/*runtime-proof.json',
      description: '模拟器/真机安装启动证据（截图+启动日志）',
    },
    unitTestsAloneInsufficient: true,
  },
  'library-sdk': {
    type: 'library-sdk',
    label: '类库/SDK（无独立运行面）',
    markers: ['**/package.json'],
    runtimeEvidence: {
      kind: 'idempotent-exec',
      artifactGlob: 'docs/evidence/*exec*.txt',
      description: '幂等执行输出件+消费方契约测试（无 UI 面≠免运行证据——消费方能跑通即证据）',
    },
    unitTestsAloneInsufficient: false,
  },
  'governance-doc': {
    type: 'governance-doc',
    label: '治理/文档（无运行面）',
    markers: [],
    runtimeEvidence: { kind: 'none-required', artifactGlob: '', description: '模板字段核对即为证据面' },
    unitTestsAloneInsufficient: false,
  },
}

/** 由仓库文件路径集合判定交付形态（保守：命中标记即列入，消费方再按任务范围收窄） */
export function detectDeliveryTypes(filePaths: string[]): DeliveryType[] {
  const hit = (patterns: string[]) =>
    patterns.some((pat) => matchGlobPath(pat, filePaths))
  const out: DeliveryType[] = []
  if (hit(DELIVERY_CONTRACTS['mini-program'].markers)) out.push('mini-program')
  if (hit(DELIVERY_CONTRACTS['mobile-app'].markers)) out.push('mobile-app')
  if (hit(DELIVERY_CONTRACTS['web-frontend'].markers)) out.push('web-frontend')
  if (out.length === 0 && hit(DELIVERY_CONTRACTS['backend-service'].markers)) out.push('backend-service')
  return out
}

/** 简化 glob：仅支持「双星斜杠」前缀与字面后缀（契约标记的受限形态，避免引全量 glob 引擎） */
function matchGlobPath(pattern: string, paths: string[]): boolean {
  const suffix = pattern.replace(/^\*\*\//, '')
  return paths.some((p) => p === suffix || p.endsWith('/' + suffix) || p.includes(suffix.replace(/\*/g, '')))
}

export function requiredRuntimeEvidence(type: DeliveryType): RuntimeEvidenceSpec {
  return DELIVERY_CONTRACTS[type].runtimeEvidence
}

/** 形态×在档证据核验（关卡/看板消费的纯判定；evidenceKinds=本轮在档的证据形态集合） */
export function validateDeliveryEvidence(
  type: DeliveryType,
  evidenceKinds: string[],
): { ok: boolean; violations: string[] } {
  const spec = requiredRuntimeEvidence(type)
  if (spec.kind === 'none-required') return { ok: true, violations: [] }
  const violations: string[] = []
  if (!evidenceKinds.includes(spec.kind)) {
    violations.push(
      `交付形态 ${type}（${DELIVERY_CONTRACTS[type].label}）缺运行证据 ${spec.kind}（${spec.description}）` +
        (DELIVERY_CONTRACTS[type].unitTestsAloneInsufficient ? '——单测全绿不等于可运行' : ''),
    )
  }
  return { ok: violations.length === 0, violations }
}

/** 看板列证据契约建议件（column-automation requiredArtifacts 消费） */
export function requiredArtifactsForDeliveryTypes(types: DeliveryType[]): string[] {
  return [...new Set(types.map((t) => requiredRuntimeEvidence(t).artifactGlob).filter(Boolean))]
}
