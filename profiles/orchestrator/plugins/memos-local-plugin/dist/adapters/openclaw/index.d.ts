import type { DefinedPluginEntry, DefinePluginEntryOptions } from "./openclaw-api.js";
export declare const PLUGIN_ID = "memos-local-plugin";
export declare const PLUGIN_VERSION: string;
/**
 * Module shape mirrors `openclaw/src/plugin-sdk/plugin-entry.ts::
 * DefinedPluginEntry`. When built into the OpenClaw monorepo the host
 * calls `module.default.register(api)` with a real `OpenClawPluginApi`.
 */
declare const plugin: DefinedPluginEntry;
export default plugin;
/** Re-export the plain factory for tests / custom hosts. */
export declare function defineMemosLocalOpenClawPlugin(overrides?: Partial<DefinePluginEntryOptions>): DefinedPluginEntry;
//# sourceMappingURL=index.d.ts.map