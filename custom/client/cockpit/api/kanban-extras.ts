// 原自建 wrapper 已迁入主 client（patch 166），此处 re-export 保向后兼容。
// 调用方 import { listWorkspaceFiles, getTimeline, searchSessions,
//   SessionSearchResult, FileNode, TimelineItem } from '@/custom/cockpit/api/kanban-extras'
// 仍可工作，指向主 client 的实现。
export {
  searchSessions,
  listWorkspaceFiles,
  getTimeline,
  type SessionSearchResult,
  type FileNode,
  type TimelineItem,
} from '@/api/hermes/kanban'
