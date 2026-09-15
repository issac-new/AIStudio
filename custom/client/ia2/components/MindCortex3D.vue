<!-- overlay/custom/client/ia2/components/MindCortex3D.vue -->
<!-- 方案 B 思维隐喻原型（2026-09-15）：皮层柱拓扑——与方案 A 形态对照实验。
     皮层地形（脑回起伏网格）+ 皮层柱（任务：粗细=运行史、高度=活跃度、顶面色相）
     + 轴突束（核心→柱萌芽弧 / 柱↔柱委派弧 / 柱→运行产生弧）+ 新任务萌芽生长动画。
     色彩读全局 CSS 变量（浅色一致）。交互：滚轮缩放/拖拽旋转（与 MindViz3D 同轨）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as THREE from 'three'
import { buildCortexScene, type CortexNode, type CortexScene } from '../adapters/mindcortex'
import type { MindProjectionDto } from '../adapters/mind'

const props = defineProps<{ projection: MindProjectionDto }>()
const emit = defineEmits<{
  (e: 'node-click', node: CortexNode): void
  (e: 'fallback-2d'): void
}>()
const { t } = useI18n()

const scene = computed<CortexScene>(() => buildCortexScene(props.projection))

const containerRef = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let threeScene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let animId = 0
let disposed = false
const buddingMeshes: THREE.Mesh[] = []

const orbit = {
  theta: Math.PI * 0.28,
  phi: Math.PI * 0.36,
  dist: 560,
  targetY: 60,
  dragging: false,
  lastX: 0,
  lastY: 0,
}

function statusColor(status: string): number {
  const cs = getComputedStyle(document.documentElement)
  const read = (v: string, fb: string) => {
    const val = cs.getPropertyValue(v).trim()
    return val ? parseInt(val.replace('#', ''), 16) : parseInt(fb, 16)
  }
  switch (status) {
    case 'running': return read('--color-primary', '3b82f6')
    case 'awaiting-input': case 'awaiting-review': return read('--color-warning', 'f59e0b')
    case 'blocked': case 'failed': return read('--color-danger', 'e11d48')
    case 'completed': return read('--color-success', '28bf5c')
    case 'delegate': return read('--color-text-secondary', '878c99')
    default: return read('--color-text-secondary', '878c99')
  }
}

function bgColor(): number {
  const val = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
  return val ? parseInt(val.replace('#', ''), 16) : 0xffffff
}

function disposeScene(): void {
  if (animId) cancelAnimationFrame(animId)
  if (threeScene) {
    threeScene.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach(m => m.dispose())
      else if (mat) mat.dispose()
    })
  }
  renderer?.dispose()
  renderer?.domElement?.parentElement?.removeChild(renderer.domElement)
  renderer = null
  threeScene = null
  camera = null
}

function buildThree(): void {
  if (!containerRef.value || disposed) return
  disposeScene()
  buddingMeshes.length = 0

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  threeScene = new THREE.Scene()
  threeScene.background = new THREE.Color(bgColor())
  threeScene.fog = new THREE.Fog(bgColor(), 600, 1300)

  camera = new THREE.PerspectiveCamera(46, width / height, 1, 4000)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  containerRef.value.appendChild(renderer.domElement)

  threeScene.add(new THREE.AmbientLight(0xffffff, 0.8))
  const dir = new THREE.DirectionalLight(0xffffff, 0.65)
  dir.position.set(300, 500, 400)
  threeScene.add(dir)

  const sc = scene.value

  // ── 皮层地形（脑回起伏网格，XZ 纯形态非数据） ──
  const terrainGeo = new THREE.PlaneGeometry(560, 560, 24, 24)
  const posAttr = terrainGeo.attributes.position
  const terrainArr = sc.terrain
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i)
    const y = posAttr.getY(i)
    const tp = terrainArr[i]
    if (tp) posAttr.setZ(i, tp.y)
  }
  terrainGeo.computeVertexNormals()
  const terrainMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(statusColor('idle')).multiplyScalar(0.16),
    transparent: true,
    opacity: 0.35,
    wireframe: true,
  })
  const terrain = new THREE.Mesh(terrainGeo, terrainMat)
  terrain.rotation.x = -Math.PI / 2
  threeScene.add(terrain)

  // ── 皮层柱（任务：粗细=运行史、高度=活跃度） ──
  for (const node of sc.nodes.filter(n => n.kind === 'column')) {
    const color = statusColor(node.status)
    // 完成的柱结晶（八面体截顶=faceted），其余圆柱
    const geo = node.status === 'completed'
      ? new THREE.CylinderGeometry(node.r * 0.7, node.r, node.h, 8)
      : new THREE.CylinderGeometry(node.r, node.r, node.h, 20)
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: node.pulse ? color : 0x000000,
      emissiveIntensity: node.pulse ? 0.45 : 0,
      transparent: true,
      opacity: node.status === 'archived' ? 0.45 : 0.88,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(node.x, node.terrainY + node.h / 2, node.z)
    mesh.userData.mindNode = node
    // 萌芽生长：新任务从核心沟回抽出（起始 scale 0，渲染循环生长到 1）
    if (node.budding) {
      mesh.scale.set(0.01, 0.01, 0.01)
      mesh.userData.budding = { t0: performance.now() }
      buddingMeshes.push(mesh)
    }
    threeScene.add(mesh)
  }

  // ── 核心沟回（思维主体萌发源地） ──
  const coreNode = sc.nodes.find(n => n.kind === 'core')
  if (coreNode) {
    const geo = new THREE.SphereGeometry(coreNode.r, 24, 24)
    const mat = new THREE.MeshStandardMaterial({
      color: statusColor('running'),
      emissive: statusColor('running'),
      emissiveIntensity: 0.5,
    })
    const core = new THREE.Mesh(geo, mat)
    core.position.set(coreNode.x, coreNode.terrainY + coreNode.h / 2, coreNode.z)
    threeScene.add(core)
  }

  // ── 末梢运行点（柱顶环绕） ──
  for (const node of sc.nodes.filter(n => n.kind === 'run')) {
    const color = statusColor(node.status)
    const geo = new THREE.SphereGeometry(node.r, 12, 12)
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: node.pulse ? color : 0x000000,
      emissiveIntensity: node.pulse ? 0.6 : 0,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(node.x, node.y, node.z)
    mesh.userData.mindNode = node
    threeScene.add(mesh)
  }

  // ── 轴突束（孕育/委派/产生，有机弧线） ──
  for (const edge of sc.edges) {
    const from = new THREE.Vector3(edge.fromPos.x, edge.fromPos.y, edge.fromPos.z)
    const to = new THREE.Vector3(edge.toPos.x, edge.toPos.y, edge.toPos.z)
    const apex = new THREE.Vector3(
      (edge.fromPos.x + edge.toPos.x) / 2,
      edge.apexY,
      (edge.fromPos.z + edge.toPos.z) / 2,
    )
    const curve = new THREE.QuadraticBezierCurve3(from, apex, to)
    const pts = curve.getPoints(24)
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({
      color: statusColor(edge.status),
      transparent: true,
      opacity: edge.relKind === 'delegate' ? 0.5 : 0.14 + edge.strength * 0.4,
      // 委派弧用虚线（轴突束语义区别于孕育/产生）
      ...(edge.relKind === 'delegate' ? { dashSize: 6, gapSize: 4 } : {}),
    })
    const line = new THREE.Line(geo, mat)
    if (edge.relKind === 'delegate') line.computeLineDistances()
    threeScene.add(line)
  }

  // ── 拾取 ──
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const onClick = (ev: MouseEvent) => {
    if (!renderer || !camera) return
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(threeScene!.children.filter(o => o.userData.mindNode))
    const node = hits[0]?.object.userData.mindNode as CortexNode | undefined
    if (node?.to) emit('node-click', node)
  }
  renderer.domElement.addEventListener('click', onClick)

  // ── 轨道交互 ──
  const el = renderer.domElement
  const onDown = (e: MouseEvent) => { orbit.dragging = true; orbit.lastX = e.clientX; orbit.lastY = e.clientY }
  const onMove = (e: MouseEvent) => {
    if (!orbit.dragging) return
    orbit.theta -= (e.clientX - orbit.lastX) * 0.006
    orbit.phi = Math.max(0.15, Math.min(Math.PI * 0.55, orbit.phi - (e.clientY - orbit.lastY) * 0.006))
    orbit.lastX = e.clientX; orbit.lastY = e.clientY
  }
  const onUp = () => { orbit.dragging = false }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    orbit.dist = Math.max(200, Math.min(1200, orbit.dist + e.deltaY * 0.6))
  }
  el.addEventListener('mousedown', onDown)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  el.addEventListener('wheel', onWheel, { passive: false })

  const tick = () => {
    if (disposed || !renderer || !camera || !threeScene) return
    camera.position.set(
      Math.cos(orbit.theta) * Math.sin(orbit.phi) * orbit.dist,
      orbit.targetY + Math.cos(orbit.phi) * orbit.dist,
      Math.sin(orbit.theta) * Math.sin(orbit.phi) * orbit.dist,
    )
    camera.lookAt(0, orbit.targetY, 0)

    // 萌芽生长动画（新任务抽出：scale 0→1 弹性）
    const now = performance.now()
    for (const mesh of buddingMeshes) {
      const t0 = (mesh.userData.budding as { t0: number }).t0
      const k = Math.min((now - t0) / 1200, 1)
      const ease = 1 - Math.pow(1 - k, 3)
      mesh.scale.setScalar(Math.max(ease, 0.01))
    }

    renderer.render(threeScene, camera)
    animId = requestAnimationFrame(tick)
  }
  tick()

  cleanupFns.push(() => {
    el.removeEventListener('mousedown', onDown)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    el.removeEventListener('wheel', onWheel)
  })
}

const cleanupFns: Array<() => void> = []

function onResize(): void {
  if (!renderer || !camera || !containerRef.value) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

onMounted(() => {
  try {
    buildThree()
    window.addEventListener('resize', onResize)
  } catch {
    emit('fallback-2d')
  }
})

onUnmounted(() => {
  disposed = true
  window.removeEventListener('resize', onResize)
  cleanupFns.forEach(fn => fn())
  disposeScene()
})

watch(() => props.projection, () => {
  if (!disposed) buildThree()
}, { deep: true })
</script>

<template>
  <div class="lmc3d">
    <div ref="containerRef" class="lmc3d__canvas" data-testid="lmc3d-canvas" />
    <div class="lmc3d__hint">{{ t('loopMind.3dHint') }}</div>
    <div class="lmc3d__proto-badge">{{ t('loopMind.protoB') }}</div>
  </div>
</template>

<style scoped>
.lmc3d { position: relative; width: 100%; height: 100%; }
.lmc3d__canvas { width: 100%; height: 100%; cursor: grab; }
.lmc3d__canvas:active { cursor: grabbing; }
.lmc3d__hint {
  position: absolute; right: 10px; bottom: 8px; z-index: 4;
  font-size: 10.5px; color: var(--color-text-secondary, #878c99);
  background: var(--bg-card, var(--bg-primary));
  padding: 3px 9px; border-radius: var(--radius-standard);
  border: 1px solid var(--border-color);
  pointer-events: none;
}
.lmc3d__proto-badge {
  position: absolute; left: 10px; bottom: 8px; z-index: 4;
  font-size: 10.5px; color: var(--color-warning, #f59e0b);
  background: var(--bg-card, var(--bg-primary));
  padding: 3px 9px; border-radius: var(--radius-standard);
  border: 1px solid var(--color-warning, #f59e0b);
  pointer-events: none;
}
</style>
