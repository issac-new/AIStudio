// 应用 store（合规样本）：按领域拆分后的小 store，行数低于阈值
import { create } from 'zustand';

interface TodoState {
  items: string[];
  add: (text: string) => void;
  clear: () => void;
}

export const useTodoStore = create<TodoState>((set) => ({
  items: [],
  add: (text) => set((s) => ({ items: [...s.items, text] })),
  clear: () => set({ items: [] }),
}));
