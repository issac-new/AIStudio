/**
 * Single-file ZIP archive builder.
 *
 * Skill download endpoints want to hand out a `<skill>.zip` containing
 * a single `SKILL.md` file. Pulling in `adm-zip` / `archiver` for that
 * is overkill, so we hand-roll the minimal PKZIP layout: one local
 * file header, one central directory record, one end-of-central-
 * directory record. CRC32 + STORE (no compression) payload.
 *
 * Reference: PKZIP APPNOTE.TXT §4 / 4.3 / 4.4.
 *
 * Limitations (intentional):
 *   - Only one entry per archive.
 *   - No ZIP64 — file size capped at 2 GiB.
 */
import { Buffer } from "node:buffer";
export declare function buildSingleFileZip(filename: string, contents: string | Uint8Array): Buffer;
export declare function computeCrc32(buf: Uint8Array): number;
//# sourceMappingURL=tiny-zip.d.ts.map