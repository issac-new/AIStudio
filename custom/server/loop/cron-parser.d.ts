declare module 'cron-parser' {
  export class CronExpressionParser {
    static parse(expression: string, options?: { tz?: string; currentDate?: Date }): {
      next(): { toISOString(): string }
      prev(): { toISOString(): string }
    }
  }
  const _default: { CronExpressionParser: typeof CronExpressionParser }
  export default _default
}
