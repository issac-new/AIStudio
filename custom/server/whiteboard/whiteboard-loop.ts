// overlay/whiteboard 域：白板回路（qoder §四 P2-9 吸收，矩阵 §3.2 qoder P2）。
//
// qoder 语义（白板升级为 Agent 生成+标注圈选回传）：白板不只画——**双向**：
// Agent 生成图（架构图/流程图供人看）+ 人**标注圈选回传**（圈一块→注释→回传
// 给 Agent 作为指令）。回传圈选=人机协作的视觉输入面。衔接画板（IdeBoardPane）
// 与 413 证据（标注即工件）：本层=回路判定纯函数。
export interface WhiteboardGen {
  genId: string
  kind: 'architecture' | 'flow' | 'freeform'
  at: number
}

export interface BoardAnnotation {
  annotationId: string
  /** 圈选区域（相对坐标 0-1）。 */
  region: { x: number; y: number; w: number; h: number }
  note: string
  at: number
}

export interface WhiteboardRound {
  genId: string
  annotations: BoardAnnotation[]
  /** 回传给 Agent 的指令（圈选注释聚合）。 */
  feedback: string
}

/** 圈选→回传（qoder：标注圈选回传语义——注释聚合为 Agent 指令）。 */
export function roundTrip(gen: WhiteboardGen, annotations: readonly BoardAnnotation[]): WhiteboardRound {
  return {
    genId: gen.genId,
    annotations: [...annotations],
    feedback: annotations.length
      ? annotations.map((a) => `圈选(${a.region.x.toFixed(2)},${a.region.y.toFixed(2)},${a.region.w.toFixed(2)},${a.region.h.toFixed(2)}): ${a.note}`).join('\n')
      : '',
  }
}

/** 校验圈选（区域在画布内——0-1 相对坐标）。 */
export function validAnnotation(a: BoardAnnotation): boolean {
  const { x, y, w, h } = a.region
  return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1
}
