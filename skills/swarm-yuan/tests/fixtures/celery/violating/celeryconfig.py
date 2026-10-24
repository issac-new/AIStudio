# violating: pickle 序列化 + 无时区 + 无路由 + 无监控
task_serializer = 'pickle'
CELERY_BROKER_URL = 'redis://localhost:6379/0'
