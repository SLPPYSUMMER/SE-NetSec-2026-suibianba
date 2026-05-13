from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('website', '0278_scan_asset_sync'),
    ]

    operations = [
        migrations.AddField(
            model_name='report',
            name='impact_scope',
            field=models.TextField(blank=True, default='', help_text='影响范围'),
        ),
    ]
