export function makeMigrationsRepo(db) {
    const list = db.prepare(`SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC`);
    return {
        listApplied() {
            return list.all().map((r) => ({
                version: r.version,
                name: r.name,
                appliedAt: r.applied_at,
            }));
        },
        highestAppliedVersion() {
            const rows = this.listApplied();
            return rows.length === 0 ? null : rows[rows.length - 1].version;
        },
    };
}
//# sourceMappingURL=migrations.js.map