---
ruleset_id: celery
适用版本: Celery 5.3.x–5.5.x（Python 3.8+/3.9+）
最后调研: 2026-07-17（来源：https://docs.celeryq.dev/en/stable/ ；https://github.com/celery/celery/releases ；https://docs.celeryq.dev/en/stable/userguide/tasks.html ；https://docs.celeryq.dev/en/stable/userguide/workers.html ）
深度门槛: 10
---

# Celery 规则集

## §1 探查信号
| 信号类型 | 模式 | 置信度 |
| 依赖 | celery / celery[redis] / celery[sqs] / kombu | 高 |
| 注解 | @shared_task / @app.task / @task | 高 |
| 文件 | celery.py / celeryconfig.py / tasks.py | 中 |
| 配置 | CELERY_BROKER_URL / CELERY_RESULT_BACKEND / task_routes / beat_schedule | 高 |

## §2 特定构件枚举
- 任务定义: grep -rlE '@shared_task|@app\.task|@task' ... --include='*.py'
- Celery 配置: find ... -name 'celeryconfig.py' -o -name 'celery.py'
- 定时任务 beat_schedule: grep -rnE 'beat_schedule\s*=' ...

## §3 领域规律

### 规律：acks_late=True 须保证任务幂等
- **适用版本**: 全版本
- **规律**: acks_late=True 在任务执行后才确认消息，worker 崩溃会重投递，须保证重复执行无副作用（去重键/状态机）
- **违反后果**: 重复执行产生副作用（重复扣款/重复发邮件）
- **验证方法**: grep -rnE 'acks_late\s*=\s*True' 任务文件，核对是否有幂等保护（去重表/Redis SETNX/状态字段）
- **对应门禁**: fw_celery_acks_late_idempotent(fail)

```verify
id: celery-r1
cmd: 
expect: always
```

### 规律：重试须配退避与抖动
- **适用版本**: 全版本
- **规律**: @task(autoretry_for=..., retry_backoff=True, retry_jitter=True) 防雪崩重试
- **违反后果**: 失败任务立即重试压垮下游
- **验证方法**: grep -rnE 'retry_backoff\s*=\s*True' 任务文件
- **对应门禁**: fw_celery_retry_backoff(warn)

```verify
id: celery-r2
cmd: 
expect: always
```

### 规律：结果后端选型须匹配可靠性需求
- **适用版本**: 全版本
- **规律**: RPC 后端不可靠（worker 重启丢失）；Redis/DB 后端持久化；无结果需求时 result_backend=None 减少开销
- **违反后果**: 任务结果丢失/性能损耗
- **验证方法**: grep -rnE 'result_backend\s*=' 配置文件
- **对应门禁**: fw_celery_result_backend(warn)

```verify
id: celery-r3
cmd: 
expect: always
```

### 规律：时区须显式配置 enable_utc
- **适用版本**: 全版本
- **规律**: enable_utc=True + timezone='Asia/Shanghai' 防定时任务时区错乱
- **违反后果**: beat 定时任务在错误时区触发
- **验证方法**: grep -rnE 'enable_utc\s*=\s*True|timezone\s*=' 配置文件
- **对应门禁**: fw_celery_timezone(warn)

```verify
id: celery-r4
cmd: 
expect: always
```

### 规律：worker 并发模型须匹配任务类型
- **适用版本**: 全版本
- **规律**: CPU 密集用 prefork；IO 密集可用 gevent/eventlet；CPU+IO 混合须分 worker 池
- **违反后果**: IO 阻塞占满 prefork worker / gevent 对 CPU 密集任务无加速
- **验证方法**: grep -rnE 'worker_concurrency|pool\s*=' 配置/启动脚本
- **对应门禁**: fw_celery_concurrency_model(warn)

```verify
id: celery-r5
cmd: 
expect: always
```

### 规律：任务路由须隔离队列
- **适用版本**: 全版本
- **规律**: task_routes 将慢任务/关键任务路由到独立队列，防互饿
- **违反后果**: 慢任务占满队列阻塞关键任务
- **验证方法**: grep -rnE 'task_routes\s*=' 配置文件
- **对应门禁**: fw_celery_task_routes(warn)

```verify
id: celery-r6
cmd: 
expect: always
```

### 规律：任务须设过期时间
- **适用版本**: 全版本
- **规律**: @task(time_limit=..., soft_time_limit=...) 或 expires 防僵尸任务
- **违反后果**: 任务无限执行占满 worker
- **验证方法**: grep -rnE 'time_limit|soft_time_limit|expires' 任务文件
- **对应门禁**: fw_celery_time_limit(warn)

```verify
id: celery-r7
cmd: 
expect: always
```

### 规律：任务失败须有监控告警
- **适用版本**: 全版本
- **规律**: 须配置 Flower/Prometheus 监控 + 任务失败告警（on_failure 回调/信号）
- **违反后果**: 任务静默失败无人知
- **验证方法**: grep -rnE 'on_failure| Flower|prometheus' 配置/任务文件
- **对应门禁**: fw_celery_monitoring(warn)

```verify
id: celery-r8
cmd: 
expect: always
```

### 规律：消息序列化须用 json 而非 pickle
- **适用版本**: 全版本
- **规律**: task_serializer='json' 防 pickle 反序列化 RCE（CWE-502）
- **违反后果**: pickle 反序列化 RCE
- **验证方法**: grep -rnE 'task_serializer\s*=\s*.pickle.' 配置文件
- **对应门禁**: fw_celery_serializer_pickle(fail)

```verify
id: celery-r9
cmd: 
expect: always
```

### 规律：beat 定时任务须幂等
- **适用版本**: 全版本
- **规律**: beat_schedule 中的任务须幂等（beat 可能重复触发/worker 可能重投递）
- **违反后果**: 重复执行副作用
- **验证方法**: grep -rnE 'beat_schedule\s*=' 配置文件，核对任务幂等
- **对应门禁**: fw_celery_beat_idempotent(warn)

```verify
id: celery-r10
cmd: 
expect: always
```

### 规律：chain/group/chord 须处理子任务失败
- **适用版本**: 全版本
- **规律**: chain 中子任务失败会中断链；chord 须配回调处理部分失败
- **违反后果**: 任务链静默中断
- **验证方法**: grep -rnE 'chain\(|group\(|chord\(' 任务文件，核对错误处理
- **对应门禁**: fw_celery_canvas_error(warn)

```verify
id: celery-r11
cmd: 
expect: always
```

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / 标准映射（CWE/GB））
| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | 标准映射（CWE/GB） |
|---------|------|---------|---------|---------|
| fw_celery_acks_late_idempotent | fail | acks_late=True 且无幂等信号（去重表/SETNX/状态字段）→ fail | CELERY_SRC_GLOBS | — |
| fw_celery_serializer_pickle | fail | task_serializer=pickle → fail | CELERY_SRC_GLOBS | CWE-502 |
| fw_celery_retry_backoff | warn | @task 无 retry_backoff=True → warn | CELERY_SRC_GLOBS | — |
| fw_celery_result_backend | warn | 无 result_backend 配置 → warn | CELERY_SRC_GLOBS | — |
| fw_celery_timezone | warn | 无 enable_utc/timezone → warn | CELERY_SRC_GLOBS | — |
| fw_celery_concurrency_model | warn | 无 pool/worker_concurrency 配置 → warn | CELERY_SRC_GLOBS | — |
| fw_celery_task_routes | warn | 无 task_routes → warn | CELERY_SRC_GLOBS | — |
| fw_celery_time_limit | warn | @task 无 time_limit/soft_time_limit → warn | CELERY_SRC_GLOBS | — |
| fw_celery_monitoring | warn | 无 Flower/on_failure/prometheus → warn | CELERY_SRC_GLOBS | — |
| fw_celery_beat_idempotent | warn | beat_schedule 存在但任务无幂等信号 → warn | CELERY_SRC_GLOBS | — |
| fw_celery_canvas_error | warn | chain/group/chord 存在但无错误处理 → warn | CELERY_SRC_GLOBS | — |

<!--
标准映射列 2026-07-20 P1 补登：CWE 取自本文件 §3/门禁输出口径与通行分类，GB 条款沿用 references/standards-compliance.md §D 口径，无明确映射标 —。
-->

## §5 跨框架交互
| 交互对 | 规则 | 理由 |
| celery × redis | 结果后端/ Broker 用 Redis 须配连接池与密码 | 防 Redis 宕机致任务丢失 |
| celery × rabbitmq | 须显式 confirm_publish + heartbeat 配置 | 防消息丢失与连接断开 |
| celery × flask/django | 须用 @shared_task 而非 @app.task（解耦 app 实例） | 避免循环导入 |
| celery × prometheus | exporter 用 celery-exporter 而非自写 | 自写漏计 worker 状态/重试次数 |

## §6 版本陷阱速查
| 版本 | 变化 | 影响 |
| Celery 5.3 | Python 3.7 EOL，最低 3.8 | 旧项目须升级 Python |
| Celery 5.5 | 待验证：具体 breaking change 未联网核实 | 待验证 |
