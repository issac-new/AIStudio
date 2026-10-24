from django.db import connection, transaction
from django.http import JsonResponse
from .models import Order


def order_list(request):
    # select_related 消除 N+1
    orders = Order.objects.select_related('customer').all()
    data = [{'id': o.id, 'customer': o.customer.name} for o in orders]
    return JsonResponse(data, safe=False)


def order_detail_raw(request, oid):
    # 参数化原生 SQL（%s 占位，禁止拼接）
    with connection.cursor() as cursor:
        cursor.execute("SELECT id, total FROM shop_order WHERE id = %s", [oid])
        row = cursor.fetchone()
    return JsonResponse({'row': str(row)})


def create_orders(request):
    # 多写操作包 transaction.atomic
    with transaction.atomic():
        Order.objects.create(total=10)
        Order.objects.create(total=20)
    return JsonResponse({'ok': True})
