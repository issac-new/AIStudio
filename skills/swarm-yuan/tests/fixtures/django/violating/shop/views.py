from django.db import connection
from django.http import JsonResponse
from .models import Order


def order_list(request):
    # N+1：未 select_related，循环访问 o.customer.name 每行一次 SQL
    orders = Order.objects.all()
    data = []
    for o in orders:
        data.append({'id': o.id, 'customer': o.customer.name})
    return JsonResponse(data, safe=False)


def order_detail_raw(request, oid):
    # SQL 注入：f-string 拼接原生 SQL
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT * FROM shop_order WHERE id = {oid}")
        row = cursor.fetchone()
    return JsonResponse({'row': str(row)})


def create_orders(request):
    # 多写无事务：中途失败留半态
    c1 = Order(total=10)
    c1.save()
    c2 = Order(total=20)
    c2.save()
    return JsonResponse({'ok': True})
