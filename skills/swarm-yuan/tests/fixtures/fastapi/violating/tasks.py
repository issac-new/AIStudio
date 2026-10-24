import time
from fastapi import BackgroundTasks


def run_report():
    # 违规：BackgroundTasks 承载长任务（须 Celery/RQ）
    time.sleep(300)


def schedule(background: BackgroundTasks):
    background.add_task(run_report)
