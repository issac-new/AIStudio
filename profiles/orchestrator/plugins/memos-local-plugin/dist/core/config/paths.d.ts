/**
 * The single source of truth for "where does runtime data live for agent X?"
 *
 * Every other module asks this resolver instead of joining its own paths.
 * That way, when the convention changes (or `MEMOS_HOME` overrides it), only
 * this file needs to know.
 */
import type { AgentKind } from "../types.js";
export interface ResolvedHome {
    /** Absolute path to the runtime root (e.g. ~/.openclaw/memos-plugin). */
    root: string;
    /** Absolute path to config.yaml. */
    configFile: string;
    /** SQLite DB lives under here. */
    dataDir: string;
    dbFile: string;
    /** Crystallized skills package directory. */
    skillsDir: string;
    /** Logs directory (app, error, audit, llm, perf, events, …). */
    logsDir: string;
    /** Daemon pid/port files. */
    daemonDir: string;
}
/**
 * Resolve the runtime home for `agent`. Override precedence (highest first):
 *
 *   1. `MEMOS_HOME` environment variable (covers everything).
 *   2. `MEMOS_CONFIG_FILE` environment variable (covers only the config file
 *      path; data/skills/logs still derive from the same parent dir).
 *   3. `defaultHome` argument.
 *   4. Built-in default for `agent` (`~/.openclaw/memos-plugin/` etc.).
 */
export declare function resolveHome(agent: AgentKind, defaultHome?: string): ResolvedHome;
/**
 * Replace the `{HOME}` placeholder and a leading `~` with the user's home dir.
 * (Done explicitly rather than via shell so cross-platform behaviour is sane.)
 */
export declare function expandHome(p: string): string;
//# sourceMappingURL=paths.d.ts.map