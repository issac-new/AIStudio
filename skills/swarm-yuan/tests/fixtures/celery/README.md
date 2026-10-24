# celery fixture 说明

- violating 主触发 2 个 fail 意图：task_serializer=pickle / acks_late=True 无幂等信号。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：
  `fw_celery_acks_late_idempotent`、`fw_celery_serializer_pickle`）。
- 2026-07-20 P1-B6 沉睡唤醒（夹具侧）：`fw_celery_acks_late_idempotent` 门禁语义不变
  （全项目 grep 幂等信号词 `idempoten|dedup|去重|SETNX|setnx|state=DONE/COMPLETED`），
  但 violating/tasks.py 注释「无去重保护」意外命中信号词 `去重`，
  门禁被夹具自我豁免、 fail 永不触发。
  修复：注释措辞改「无任何防重复保护」（描述不变、剔除信号词），
  门禁按既定语义触发 fail。compliant 侧注释 `# idempotent: 去重表...` 为有意信号，不动。
