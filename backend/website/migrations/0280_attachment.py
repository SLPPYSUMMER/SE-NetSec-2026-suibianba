import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('website', '0279_add_impact_scope'),
    ]

    operations = [
        migrations.CreateModel(
            name='Attachment',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(help_text='存储路径', upload_to='attachments/%Y/%m/')),
                ('filename', models.CharField(help_text='原始文件名', max_length=255)),
                ('size', models.PositiveIntegerField(help_text='文件大小（字节）')),
                ('mime_type', models.CharField(blank=True, help_text='MIME 类型', max_length=100)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True, help_text='上传时间')),
                ('report', models.ForeignKey(help_text='关联的漏洞报告', on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='website.report')),
                ('uploader', models.ForeignKey(help_text='上传者', on_delete=django.db.models.deletion.CASCADE, related_name='uploaded_attachments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': '附件',
                'verbose_name_plural': '附件',
                'ordering': ['-uploaded_at'],
            },
        ),
    ]
