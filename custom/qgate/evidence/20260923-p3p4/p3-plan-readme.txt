profile: feature-close (tier=standard)
changed: README.md
  (no applicable gates)
profile: feature-close (tier=standard)
changed: db.mjs
  engineering.basic-check [L1] triggers=task_close|pre_commit|release claims=engineering.lint-clean
  data.persistence-integrity [L2] triggers=task_close|pre_commit|release claims=persistence.request-fields-correct,persistence.cross-table-consistent
