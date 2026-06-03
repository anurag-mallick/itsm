from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('discovery', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='discovereddevice',
            name='port_services',
            field=models.JSONField(default=dict),
        ),
        migrations.AddField(
            model_name='discovereddevice',
            name='banners',
            field=models.JSONField(default=dict),
        ),
        migrations.AddField(
            model_name='discovereddevice',
            name='rdp_available',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='discovereddevice',
            name='ssh_available',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='discovereddevice',
            name='vnc_available',
            field=models.BooleanField(default=False),
        ),
    ]
