<!-- overlay/custom/client/ia2/components/MindViz3D.vue -->
<!-- 3D 思维图谱（2026-09-15 形态重构 v3）：**多维功能分区结构**——用户裁决
     「皮层不对：像大脑那样有不同的功能分区，是一个多维结构，不是一个弯曲表面
     的堆砌」。功能分区（聚类族 × 状态功能面 × 活跃度三维定位）= 半透明分区体，
     内部任务柱群自治；分区之间由投射通路（跨区关系边拉起）连接；无中心原点。
     交互：滚轮缩放、拖拽旋转、左侧分区聚焦。色彩读全局 CSS 变量（浅色一致）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as THREE from 'three'
import { buildMind3DScene, type MindNode, type MindScene } from '../adapters/mind3d'
import type { MindProjectionDto } from '../adapters/mind'

const props = defineProps<{ projection: MindProjectionDto; focusedIds?: Set<string> | null }>()
const emit = defineEmits<{
  (e: 'node-click', node: MindNode): void
  (e: 'fallback-2d'): void
}>()
const { t } = useI18n()

const scene = computed<MindScene>(() => buildMind3DScene(props.projection))

const containerRef = ref<HTMLDivElement | null>(null)
const focusCluster = ref<string | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let threeScene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let animId = 0
let disposed = false
const buddingMeshes: THREE.Mesh[] = []
const pingRings: THREE.Mesh[] = []

const orbit = {
  theta: Math.PI * 0.28,
  phi: Math.PI * 0.4,
  dist: 620,
  targetX: 0,
  targetY: 30,
  targetZ: 0,
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

function hashPhase(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return ((h >>> 0) % 1000) / 1000
}

function makeLabelSprite(text: string, sub?: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 26
  const subSize = 18
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`
  const name = text.length > 16 ? text.slice(0, 16) + '…' : text
  const w = Math.max(ctx.measureText(name).width, sub ? ctx.measureText(sub).width : 0) + 20
  canvas.width = Math.ceil(w)
  canvas.height = sub ? fontSize + subSize + 14 : fontSize + 12
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`
  const cs = getComputedStyle(document.documentElement)
  const fg = cs.getPropertyValue('--text-primary').trim() || '#1f2329'
  const fgSub = cs.getPropertyValue('--text-secondary').trim() || '#878c99'
  ctx.textAlign = 'center'
  ctx.fillStyle = fg
  ctx.fillText(name, canvas.width / 2, fontSize + 2)
  if (sub) {
    ctx.font = `${subSize}px system-ui, sans-serif`
    ctx.fillStyle = fgSub
    ctx.fillText(sub, canvas.width / 2, fontSize + subSize + 8)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(mat)
  const scale = 0.14
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1)
  return sprite
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
  pingRings.length = 0

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  threeScene = new THREE.Scene()
  threeScene.background = new THREE.Color(bgColor())
  threeScene.fog = new THREE.Fog(bgColor(), 700, 1500)

  camera = new THREE.PerspectiveCamera(46, width / height, 1, 4000)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  containerRef.value.appendChild(renderer.domElement)

  threeScene.add(new THREE.AmbientLight(0xffffff, 0.85))
  const dir = new THREE.DirectionalLight(0xffffff, 0.6)
  dir.position.set(300, 500, 400)
  threeScene.add(dir)

  const sc = scene.value

  // ── 簇界标（力导向收敛后的涌现团块；无手工边界体） ──
  for (const cluster of sc.clusters) {
    const label = makeLabelSprite(cluster.label, `${cluster.count} ${t('loopMind.clusterTasksUnit')}`)
    label.position.set(cluster.cx, 70, cluster.cz)
    threeScene.add(label)
  }

  // ── 分区柱群（任务实体：粗细=运行史、高度=活跃度） ──
  const LABEL_TOP_N = 6
  const columns = sc.nodes.filter(n => n.kind === 'column')
  const labelVisibleIds = new Set(
    [...columns].sort((a, b) => b.strength - a.strength).slice(0, LABEL_TOP_N).map(n => n.id)
      .concat(columns.filter(n => n.pendingAlert).map(n => n.id)),
  )

  for (const node of columns) {
    const color = statusColor(node.status)
    const geo = node.status === 'completed'
      ? new THREE.CylinderGeometry(node.r * 0.7, node.r, node.h, 8)
      : new THREE.CylinderGeometry(node.r, node.r, node.h, 20)
    const focused = props.focusedIds
    const dimmed = focused != null && !focused.has(node.id)
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: node.pulse ? color : 0x000000,
      emissiveIntensity: node.pulse ? 0.45 : 0,
      transparent: true,
      opacity: dimmed ? 0.08 : node.status === 'archived' ? 0.45 : 0.88,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(node.x, node.y + node.h / 2, node.z)
    mesh.userData.mindNode = node
    if (node.budding) {
      mesh.scale.set(0.01, 0.01, 0.01)
      mesh.userData.budding = { t0: performance.now() }
      buddingMeshes.push(mesh)
    }
    threeScene.add(mesh)

    if (labelVisibleIds.has(node.id)) {
      const label = makeLabelSprite(node.label, node.sub)
      label.position.set(node.x, node.y + node.h + 10, node.z)
      threeScene.add(label)
    }

    if (node.pendingAlert) {
      const ringGeo = new THREE.RingGeometry(node.r + 3, node.r + 4.5, 40)
      const ringMat = new THREE.MeshBasicMaterial({
        color: statusColor('awaiting-input'),
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthTest: false,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.position.set(node.x, node.y + node.h + 2, node.z)
      ring.rotation.x = -Math.PI / 2
      ring.userData.pingRing = { baseR: node.r + 3, phase: hashPhase(node.id) }
      threeScene.add(ring)
      pingRings.push(ring)
    }
  }

  // ── 末梢运行点 ──
  for (const node of sc.nodes.filter(n => n.kind === 'run')) {
    const color = statusColor(node.status)
    const geo = new THREE.SphereGeometry(node.r, 12, 12)
    const focused = props.focusedIds
    const dimmed = focused != null && !focused.has(node.id)
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: node.pulse ? color : 0x000000,
      emissiveIntensity: node.pulse ? 0.6 : 0,
      transparent: true,
      opacity: dimmed ? 0.06 : 1,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(node.x, node.y, node.z)
    mesh.userData.mindNode = node
    threeScene.add(mesh)
  }

  // ── 投射通路（跨区关系边拉起为区间通路；同区产生弧在柱顶） ──
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
    const focused = props.focusedIds
    const edgeDimmed = focused != null && !(focused.has(edge.from) && focused.has(edge.to))
    const mat = new THREE.LineBasicMaterial({
      color: statusColor(edge.status),
      transparent: true,
      opacity: edgeDimmed ? 0.04 : edge.crossCluster ? 0.6 : 0.14 + edge.strength * 0.4,
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
    const node = hits[0]?.object.userData.mindNode as MindNode | undefined
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
    orbit.dist = Math.max(200, Math.min(1300, orbit.dist + e.deltaY * 0.6))
  }
  el.addEventListener('mousedown', onDown)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  el.addEventListener('wheel', onWheel, { passive: false })

  const tick = () => {
    if (disposed || !renderer || !camera || !threeScene) return
    camera.position.set(
      orbit.targetX + Math.cos(orbit.theta) * Math.sin(orbit.phi) * orbit.dist,
      orbit.targetY + Math.cos(orbit.phi) * orbit.dist,
      orbit.targetZ + Math.sin(orbit.theta) * Math.sin(orbit.phi) * orbit.dist,
    )
    camera.lookAt(orbit.targetX, orbit.targetY, orbit.targetZ)

    const now = performance.now()
    for (const mesh of buddingMeshes) {
      const t0 = (mesh.userData.budding as { t0: number }).t0
      const k = Math.min((now - t0) / 1200, 1)
      mesh.scale.setScalar(Math.max(1 - Math.pow(1 - k, 3), 0.01))
    }
    const tSec = now / 1000
    for (const ring of pingRings) {
      const { baseR, phase } = ring.userData.pingRing as { baseR: number; phase: number }
      const cycle = ((tSec * 0.8 + phase) % 1)
      ring.scale.setScalar(1 + cycle * 1.8)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - cycle)
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

/** 分区聚焦：注视点平移到分区质心 + 拉近 */
function onFocusCluster(key: string | null): void {
  focusCluster.value = key
  if (key == null) {
    orbit.targetX = 0; orbit.targetY = 30; orbit.targetZ = 0; orbit.dist = 620
  } else {
    const c2 = scene.value.clusters.find(x => x.key === key)
    if (c2) {
      orbit.targetX = c2.cx; orbit.targetY = c2.cy; orbit.targetZ = c2.cz; orbit.dist = 340
    }
  }
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
  <div class="lm3d">
    <!-- 簇聚焦切换（力导向涌现团块：全网络 / 各任务簇） -->
    <div class="lm3d__clusters" data-testid="lm3d-regions">
      <button
        type="button"
        class="lm3d__cluster-btn"
        :class="{ 'lm3d__cluster-btn--on': focusCluster === null }"
        data-testid="lm3d-cluster-all"
        @click="onFocusCluster(null)"
      >{{ t('loopMind.zone.all') }}</button>
      <button
        v-for="region in scene.clusters"
        :key="cluster.key"
        type="button"
        class="lm3d__cluster-btn"
        :class="{ 'lm3d__cluster-btn--on': focusCluster === cluster.key }"
        :data-testid="`lm3d-cluster-${cluster.key}`"
        @click="onFocusCluster(cluster.key)"
      >{{ cluster.label }} · {{ cluster.count }}</button>
    </div>

    <div ref="containerRef" class="lm3d__canvas" data-testid="lm3d-canvas" />
    <div class="lm3d__hint">{{ t('loopMind.3dHint') }}</div>
  </div>
</template>

<style scoped>
.lm3d { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; }
.lm3d__canvas { flex: 1; min-height: 0; cursor: grab; }
.lm3d__canvas:active { cursor: grabbing; }

.lm3d__clusters {
  position: absolute; top: 10px; left: 10px; z-index: 5;
  display: flex; flex-direction: column; gap: 4px;
  max-height: calc(100% - 20px); overflow-y: auto;
}
.lm3d__cluster-btn {
  padding: 4px 10px; border-radius: var(--radius-standard);
  border: 1px solid var(--border-color);
  background: var(--bg-card, var(--bg-primary)); color: var(--text-secondary);
  font-size: 11.5px; font-family: inherit; cursor: pointer; text-align: left;
  white-space: nowrap;
}
.lm3d__cluster-btn:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.lm3d__cluster-btn--on {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary, #3b82f6);
  color: var(--bg-primary);
  font-weight: 600;
}

.lm3d__hint {
  position: absolute; right: 10px; bottom: 8px; z-index: 4;
  font-size: 10.5px; color: var(--color-text-secondary, #878c99);
  background: var(--bg-card, var(--bg-primary));
  padding: 3px 9px; border-radius: var(--radius-standard);
  border: 1px solid var(--border-color);
  pointer-events: none;
}
</style>
