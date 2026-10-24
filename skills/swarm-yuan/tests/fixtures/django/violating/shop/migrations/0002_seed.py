from django.db import migrations


def forward_seed(apps, schema_editor):
    Customer = apps.get_model('shop', 'Customer')
    Customer.objects.bulk_create([Customer(name='a'), Customer(name='b')])


class Migration(migrations.Migration):
    dependencies = [('shop', '0001_initial')]
    # 违规：RunPython 无 reverse_code，迁移不可回滚
    operations = [migrations.RunPython(forward_seed)]
