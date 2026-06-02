import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('assets', '0001_initial'),
        ('software', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AccessRequestCounter',
            fields=[
                ('id', models.PositiveSmallIntegerField(default=1, primary_key=True, serialize=False)),
                ('current', models.PositiveIntegerField(default=0)),
            ],
            options={
                'db_table': 'access_request_counter',
            },
        ),
        migrations.CreateModel(
            name='AccessRequest',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('ref_number', models.CharField(max_length=20, unique=True)),
                ('request_type', models.CharField(
                    choices=[('hardware', 'Hardware Assignment'), ('software', 'Software Access')],
                    max_length=10,
                )),
                ('status', models.CharField(
                    choices=[
                        ('pending_manager',    'Pending Manager Approval'),
                        ('manager_approved',   'Approved by Manager'),
                        ('manager_rejected',   'Rejected by Manager'),
                        ('pending_assignment', 'Pending IT Assignment'),
                        ('assigned',           'Assigned'),
                        ('cancelled',          'Cancelled'),
                    ],
                    db_index=True,
                    default='pending_manager',
                    max_length=25,
                )),
                ('justification', models.TextField()),
                ('manager_email', models.EmailField(max_length=254)),
                ('manager_name', models.CharField(blank=True, max_length=200)),
                ('approval_token', models.UUIDField(default=uuid.uuid4, unique=True)),
                ('manager_notes', models.TextField(blank=True)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('hardware_type', models.CharField(blank=True, max_length=50)),
                ('hardware_specification', models.TextField(blank=True)),
                ('software_name', models.CharField(blank=True, max_length=200)),
                ('assigned_at', models.DateTimeField(blank=True, null=True)),
                ('assignment_notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('requested_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='access_requests',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('hardware_asset', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='access_requests',
                    to='assets.hardwareasset',
                )),
                ('software_license', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='access_requests',
                    to='software.softwarelicense',
                )),
                ('assigned_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='assigned_access_requests',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'access_request',
                'ordering': ['-created_at'],
            },
        ),
    ]
