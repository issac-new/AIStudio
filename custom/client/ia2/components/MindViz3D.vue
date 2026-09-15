<!-- overlay/custom/client/ia2/components/MindViz3D.vue -->
<!-- 3D 思维图谱（2026-09-15 用户裁决：核心思维图升级 Three.js 立体图——
     可缩放/旋转/层级切换）。
     渲染 buildMind3DScene 纯函数场景（本体论分区映射到 3D 语义层）：
     核心柱（中心轴）+ 思想核球体（层内散布，标签精灵可读任务名）+ 末梢点
     + 关系连线 + 层平面网格。交互：滚轮缩放、拖拽旋转、按钮切层聚焦。
     色彩走全局 CSS 变量（浅色一致；three 场景背景取 --bg-primary）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as THREE from 'three'
import { buildMind3DScene, type Mind3DNode, type Mind3DScene, MIND3D_LAYER_GAP } from '../adapters/mind3d'
import type { MindProjectionDto } from '../adapters/mind'

const props = defineProps<{ projection: MindProjectionDto }>()
const emit = defineEmits<{
  (e: 'node-click', node: Mind3DNode): void
  /** WebGL 不可用 → 通知父级回退 2D 分区图（jsdom/旧 GPU/驱动禁用） */
  (e: 'fallback-2d'): void
}>()
const { t } = useI18n()

const scene = computed<Mind3DScene>(() => buildMind3DScene(props.projection))

const containerRef = ref<HTMLDivElement | null>(null)
/** 当前聚焦层（null = 全部层总览） */
const focusLayer = ref<number | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let threeScene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let animId = 0
let disposed = false

// ── 相机轨道状态（自研轻量轨道：拖拽旋转 + 滚轮缩放 + 层聚焦平移） ──
const orbit = {
  theta: Math.PI * 0.25,   // 方位角
  phi: Math.PI * 0.32,     // 极角
  dist: 620,               // 半径（缩放）
  targetY: MIND3D_LAYER_GAP * 1.5, // 注视点（层聚焦时平移）
  dragging: false,
  lastX: 0,
  lastY: 0,
}

/** 语义色板：状态 → 颜色（读全局 CSS 变量，three 场景用 hex） */
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
    case 'paused': return read('--color-text-secondary', '878c99')
    default: return read('--color-text-secondary', '878c99')
  }
}

function bgColor(): number {
  const cs = getComputedStyle(document.documentElement)
  const val = cs.getPropertyValue('--bg-primary').trim()
  return val ? parseInt(val.replace('#', ''), 16) : 0xffffff
}

/** 任务名 → 标签精灵（CanvasTexture 文本，语义可读） */
function makeLabelSprite(text: string, sub?: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 28
  const subSize = 20
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`
  const name = text.length > 18 ? text.slice(0, 18) + '…' : text
  const w = Math.max(ctx.measureText(name).width, sub ? ctx.measureText(sub).width : 0) + 24
  canvas.width = Math.ceil(w)
  canvas.height = sub ? fontSize + subSize + 18 : fontSize + 16
  // 重设（canvas resize 清状态）
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`
  const cs = getComputedStyle(document.documentElement)
  const fg = cs.getPropertyValue('--text-primary').trim() || '#1f2329'
  const fgSub = cs.getPropertyValue('--text-secondary').trim() || '#878c99'
  ctx.textAlign = 'center'
  ctx.fillStyle = fg
  ctx.fillText(name, canvas.width / 2, fontSize + 4)
  if (sub) {
    ctx.font = `${subSize}px system-ui, sans-serif`
    ctx.fillStyle = fgSub
    ctx.fillText(sub, canvas.width / 2, fontSize + subSize + 10)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(mat)
  const scale = 0.16
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

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  threeScene = new THREE.Scene()
  threeScene.background = new THREE.Color(bgColor())
  threeScene.fog = new THREE.Fog(bgColor(), 700, 1400)

  camera = new THREE.PerspectiveCamera(46, width / height, 1, 4000)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  containerRef.value.appendChild(renderer.domElement)

  // 灯光：环境光 + 方向光（浅色体系下的柔和立体）
  threeScene.add(new THREE.AmbientLight(0xffffff, 0.75))
  const dir = new THREE.DirectionalLight(0xffffff, 0.7)
  dir.position.set(300, 500, 400)
  threeScene.add(dir)

  const sc = scene.value
  const nodeById = new Map<string, THREE.Object3D>()

  // ── 层平面网格 + 层标签 ──
  for (const layer of sc.layers) {
    const gridColor = new THREE.Color(statusColor('idle')).multiplyScalar(0.9)
    const grid = new THREE.GridHelper(560, 14, gridColor, gridColor)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.14
    grid.position.y = layer.y
    threeScene.add(grid)

    const label = makeLabelSprite(t(`loopMind.zone.${layer.key}`), `${layer.count}`)
    label.position.set(-300, layer.y + 6, 0)
    label.scale.multiplyScalar(0.9)
    threeScene.add(label)
  }

  // ── 核心柱（中心轴，贯穿各层） ──
  const coreNode = sc.nodes.find(n => n.kind === 'core')
  if (coreNode) {
    const pillarGeo = new THREE.CylinderGeometry(2.5, 2.5, MIND3D_LAYER_GAP * 3.4, 12)
    const pillarMat = new THREE.MeshStandardMaterial({
      color: statusColor('running'), transparent: true, opacity: 0.5,
      emissive: statusColor('running'), emissiveIntensity: 0.3,
    })
    const pillar = new THREE.Mesh(pillarGeo, pillarMat)
    pillar.position.set(coreNode.x, coreNode.y, coreNode.z)
    threeScene.add(pillar)

    const coreGeo = new THREE.SphereGeometry(coreNode.r, 24, 24)
    const coreMat = new THREE.MeshStandardMaterial({
      color: statusColor('running'), emissive: statusColor('running'), emissiveIntensity: 0.6,
    })
    const core = new THREE.Mesh(coreGeo, coreMat)
    core.position.set(coreNode.x, coreNode.y, coreNode.z)
    threeScene.add(core)
    nodeById.set('core', core)
  }

  // ── 思想核球体 + 标签精灵 ──
  for (const node of sc.nodes.filter(n => n.kind === 'thought')) {
    const geo = new THREE.SphereGeometry(node.r, 22, 22)
    const color = statusColor(node.status)
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: node.pulse ? color : 0x000000,
      emissiveIntensity: node.pulse ? 0.5 : 0,
      transparent: true,
      opacity: node.status === 'archived' ? 0.5 : 0.92,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(node.x, node.y, node.z)
    mesh.userData.mindNode = node
    threeScene.add(mesh)
    nodeById.set(node.id, mesh)

    const label = makeLabelSprite(node.label, node.sub)
    label.position.set(node.x, node.y + node.r + 10, node.z)
    threeScene.add(label)
  }

  // ── 末梢运行点 ──
  for (const node of sc.nodes.filter(n => n.kind === 'run')) {
    const geo = new THREE.SphereGeometry(node.r, 14, 14)
    const color = statusColor(node.status)
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: node.pulse ? color : 0x000000,
      emissiveIntensity: node.pulse ? 0.7 : 0,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(node.x, node.y, node.z)
    mesh.userData.mindNode = node
    threeScene.add(mesh)
    nodeById.set(node.id, mesh)
  }

  // ── 关系连线（孕育/产生） ──
  for (const edge of sc.edges) {
    const pts = [
      new THREE.Vector3(edge.fromPos.x, edge.fromPos.y, edge.fromPos.z),
      new THREE.Vector3(edge.toPos.x, edge.toPos.y, edge.toPos.z),
    ]
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({
      color: statusColor(edge.status),
      transparent: true,
      opacity: 0.14 + edge.strength * 0.4,
      linewidth: 1,
    })
    threeScene.add(new THREE.Line(geo, mat))
  }

  // ── 拾取（点击节点 → 语义导航） ──
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const onClick = (ev: MouseEvent) => {
    if (!renderer || !camera) return
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(threeScene!.children.filter(o => o.userData.mindNode))
    const hit = hits[0]?.object as THREE.Mesh | undefined
    const node = hit?.userData.mindNode as Mind3DNode | undefined
    if (node?.to) emit('node-click', node)
  }
  renderer.domElement.addEventListener('click', onClick)

  // ── 轨道交互：拖拽旋转 + 滚轮缩放 ──
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
    orbit.dist = Math.max(220, Math.min(1400, orbit.dist + e.deltaY * 0.6))
  }
  el.addEventListener('mousedown', onDown)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  el.addEventListener('wheel', onWheel, { passive: false })

  // 渲染循环
  const tick = () => {
    if (disposed || !renderer || !camera || !threeScene) return
    const cy = orbit.targetY
    camera.position.set(
      Math.cos(orbit.theta) * Math.sin(orbit.phi) * orbit.dist,
      cy + Math.cos(orbit.phi) * orbit.dist,
      Math.sin(orbit.theta) * Math.sin(orbit.phi) * orbit.dist,
    )
    camera.lookAt(0, cy, 0)
    renderer.render(threeScene, camera)
    animId = requestAnimationFrame(tick)
  }
  tick()

  // 清理挂载（组件卸载时）
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

/** 层聚焦：注视点平移到该层 + 适度拉近 */
function onFocusLayer(y: number | null): void {
  focusLayer.value = y
  orbit.targetY = y ?? MIND3D_LAYER_GAP * 1.5
  orbit.dist = y == null ? 620 : 420
}

onMounted(() => {
  try {
    buildThree()
    window.addEventListener('resize', onResize)
  } catch {
    // WebGL 不可用（jsdom/旧 GPU/驱动禁用）→ 降级：通知父级回退 2D 分区图
    emit('fallback-2d')
  }
})

onUnmounted(() => {
  disposed = true
  window.removeEventListener('resize', onResize)
  cleanupFns.forEach(fn => fn())
  disposeScene()
})

// 投影变化 → 重建场景（数据驱动）
watch(() => props.projection, () => {
  if (!disposed) buildThree()
}, { deep: true })
</script>

<template>
  <div class="lm3d">
    <!-- 层切换器（语义层级视角：总览 / 各状态层） -->
    <div class="lm3d__layers" data-testid="lm3d-layers">
      <button
        type="button"
        class="lm3d__layer-btn"
        :class="{ 'lm3d__layer-btn--on': focusLayer === null }"
        data-testid="lm3d-layer-all"
        @click="onFocusLayer(null)"
      >{{ t('loopMind.zone.all') }}</button>
      <button
        v-for="layer in scene.layers"
        :key="layer.key"
        type="button"
        class="lm3d__layer-btn"
        :class="{ 'lm3d__layer-btn--on': focusLayer === layer.y }"
        :data-testid="`lm3d-layer-${layer.key}`"
        @click="onFocusLayer(layer.y)"
      >{{ t(`loopMind.zone.${layer.key}`) }} · {{ layer.count }}</button>
    </div>

    <!-- 3D 画布容器 -->
    <div ref="containerRef" class="lm3d__canvas" data-testid="lm3d-canvas" />

    <!-- 操作提示 -->
    <div class="lm3d__hint">{{ t('loopMind.3dHint') }}</div>
  </div>
</template>

<style scoped>
.lm3d { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; }
.lm3d__canvas { flex: 1; min-height: 0; cursor: grab; }
.lm3d__canvas:active { cursor: grabbing; }

.lm3d__layers {
  position: absolute; top: 10px; left: 10px; z-index: 5;
  display: flex; flex-direction: column; gap: 4px;
}
.lm3d__layer-btn {
  padding: 4px 10px; border-radius: var(--radius-standard);
  border: 1px solid var(--border-color);
  background: var(--bg-card, var(--bg-primary)); color: var(--text-secondary);
  font-size: 11.5px; font-family: inherit; cursor: pointer; text-align: left;
}
.lm3d__layer-btn:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.lm3d__layer-btn--on {
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
