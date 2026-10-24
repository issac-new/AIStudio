from celery import shared_task
# violating: acks_late=True 无幂等 + 无 retry_backoff + pickle 序列化
@shared_task(acks_late=True)
def charge_payment(order_id):
    # 无任何防重复保护，worker 崩溃重投递会重复扣款
    deduct(order_id)
