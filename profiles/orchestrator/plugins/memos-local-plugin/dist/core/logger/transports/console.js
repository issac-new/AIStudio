/**
 * Console transport. Writes pretty (TTY) or JSON/compact (non-TTY) to
 * stdout/stderr. Channel filtering is handled at the sink layer.
 */
import { formatPretty } from "../format/pretty.js";
import { formatJson } from "../format/json.js";
import { formatCompact } from "../format/compact.js";
export class ConsoleTransport {
    name = "console";
    pretty;
    format;
    isTty;
    color;
    constructor(opts) {
        this.pretty = opts.pretty;
        this.format = opts.format ?? "json";
        this.isTty = opts.isTty ?? !!process.stdout.isTTY;
        this.color = this.pretty && this.isTty;
    }
    accepts(_record) {
        return true;
    }
    write(record) {
        const stream = record.level === "error" || record.level === "fatal" || record.level === "warn"
            ? process.stderr
            : process.stdout;
        const text = this.pretty
            ? formatPretty(record, { color: this.color }) + "\n"
            : (this.format === "compact" ? formatCompact(record) : formatJson(record));
        try {
            stream.write(text);
        }
        catch {
            // Never throw from a logger.
        }
    }
    flush() { }
    close() { }
}
//# sourceMappingURL=console.js.map