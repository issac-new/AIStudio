// overlay/custom/client/loop/adapters/stage-adapter.ts
import type { LoopEvent, LoopStage } from '../types'

export interface StageNodeData {
  id: string
  label: string
  stage: LoopStage
  active: boolean
  blocked: boolean
  completed: boolean
  detail?: string
}

export interface StageEdgeData {
  source: string
  target: string
  type: 'forward' | 'pending' | 'repair'
}

const STAGE_ORDER: LoopStage[] = ['discovery', 'handoff', 'validation', 'persistence', 'scheduling']

export function buildStageGraph(currentStage: LoopStage, events: LoopEvent[]): {
  nodes: StageNodeData[]
  edges: StageEdgeData[]
} {
  const currentIdx = STAGE_ORDER.indexOf(currentStage)
  const nodes: StageNodeData[] = STAGE_ORDER.map((stage, i) => ({
    id: stage,
    label: stage,
    stage,
    active: i === currentIdx,
    completed: i < currentIdx,
    blocked: false,
  }))

  // Check for blocked (from events)
  const hasStuck = events.some(e => e.type === 'loop.stuck')
  if (hasStuck && nodes[currentIdx]) nodes[currentIdx].blocked = true

  const edges: StageEdgeData[] = []
  for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
    edges.push({
      source: STAGE_ORDER[i],
      target: STAGE_ORDER[i + 1],
      type: i < currentIdx ? 'forward' : 'pending',
    })
  }
  // repair edge (validation → handoff)
  const hasRepair = events.some(e =>
    e.type === 'loop.stage-transition' &&
    (e as any).from === 'validation' && (e as any).to === 'handoff'
  )
  if (hasRepair) {
    edges.push({ source: 'validation', target: 'handoff', type: 'repair' })
  }

  return { nodes, edges }
}
