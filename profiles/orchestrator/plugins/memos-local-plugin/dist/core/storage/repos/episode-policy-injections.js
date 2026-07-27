export function makeEpisodePolicyInjectionsRepo(db) {
    const insert = db.prepare(`INSERT OR IGNORE INTO episode_policy_injections
       (episode_id, policy_id, source, injected_at)
     VALUES (@episode_id, @policy_id, @source, @injected_at)`);
    const selectPolicyIds = db.prepare(`SELECT policy_id
       FROM episode_policy_injections
      WHERE episode_id = @episode_id
      ORDER BY injected_at DESC, policy_id DESC`);
    return {
        inject(args) {
            insert.run({
                episode_id: args.episodeId,
                policy_id: args.policyId,
                source: args.source ?? null,
                injected_at: args.now ?? Date.now(),
            });
        },
        listPolicyIdsForEpisode(episodeId) {
            return selectPolicyIds.all({ episode_id: episodeId }).map((r) => r.policy_id);
        },
    };
}
//# sourceMappingURL=episode-policy-injections.js.map