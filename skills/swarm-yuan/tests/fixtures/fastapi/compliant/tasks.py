from fastapi import BackgroundTasks


def send_email(to: str):
    # 轻量任务（秒级、可重发）才用 BackgroundTasks
    _ = to


def schedule(background: BackgroundTasks):
    background.add_task(send_email, "ops@example.com")
