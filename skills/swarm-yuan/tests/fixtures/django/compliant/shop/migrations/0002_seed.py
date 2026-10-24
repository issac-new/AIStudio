from django.db import migrations


def forward_seed(apps, schema_editor):
    Customer = apps.get_model('shop', 'Customer')
    Customer.objects.bulk_create([Customer(name='a'), Customer(name='b')])


class Migration(migrations.Migration):
    dependencies = [('shop', '0001_initial')]
    # 数据迁移提供反向操作（noop 显式标注可回滚）
    operations = [migrations.RunPython(forward_seed, reverse_code=migrations.RunPython.noop)]
