// overlay/custom/client/matrix-chat/utils/room-disambig.ts
// 同名房间消歧（推演审计二轮 U5）：多轮推演产物同名群并排无法分辨。
// 同名行尾缀短房 ID；唯一名不加噪音。纯函数，供 MatrixRoomList 消费。

/** 返回出现 ≥2 次的名字集合。 */
export function duplicateNames(names: Iterable<string>): Set<string> {
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) || 0) + 1)
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name))
}

/** matrix 房 ID → 短后缀（去 ! 前缀与 host，取前 8 位）。 */
export function shortRoomId(roomId: string): string {
  return roomId.replace(/^!/, '').split(':')[0].slice(0, 8)
}
