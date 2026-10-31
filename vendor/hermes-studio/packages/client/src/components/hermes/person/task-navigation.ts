import type { InjectionKey } from 'vue'

export const personTaskNavigation: InjectionKey<(taskId: string, executionId?: string) => void> = Symbol('personTaskNavigation')
