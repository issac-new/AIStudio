from celery import shared_task
# compliant: acks_late=True 有幂等去重 + retry_backoff
@shared_task(acks_late=True, autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True, time_limit=300, soft_time_limit=240)
def charge_payment(order_id):
    # idempotent: 去重表保证重复执行无副作用
    if DedupTable.objects.filter(key=f"charge_{order_id}").exists():
        return
    deduct(order_id)
    DedupTable.objects.create(key=f"charge_{order_id}")
