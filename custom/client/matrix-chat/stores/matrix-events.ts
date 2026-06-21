import { ref } from 'vue'

/**
 * Lightweight event bus for cross-store communication in the matrix module.
 *
 * Problem: matrix-client store needs to trigger room/thread refreshes when
 * SDK events fire, but room/thread stores need the client to read data.
 * Direct imports create circular dependencies that break TypeScript inference.
 *
 * Solution: The client store fires events on this bus; room/thread stores
 * register handlers. No store imports another store directly.
 */
export const matrixEventBus = {
  /** Called when the room list should be refreshed (new rooms, membership changes, etc.) */
  onRoomListChange: ref<(() => void) | null>(null),
  /** Called when the current room's timeline should be refreshed */
  onTimeline: ref<(() => void) | null>(null),
  /** Called when thread data should be refreshed */
  onThreadUpdate: ref<(() => void) | null>(null),
  /** Called when a room is selected (to clear thread view, etc.) */
  onSelectRoom: ref<(() => void) | null>(null),
}
