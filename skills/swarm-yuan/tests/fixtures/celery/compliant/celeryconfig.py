# compliant: json 序列化 + 时区 + 路由 + 监控
task_serializer = 'json'
enable_utc = True
timezone = 'Asia/Shanghai'
task_routes = {'critical.*': {'queue': 'critical'}}
CELERY_BROKER_URL = 'redis://localhost:6379/0'
CELERY_RESULT_BACKEND = 'redis://localhost:6379/1'
