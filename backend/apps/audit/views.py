import csv
from django.http import HttpResponse
from rest_framework import generics
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import AuditLog
from .serializers import AuditLogSerializer
from apps.accounts.permissions import IsAuditor, IsITManager


class AuditLogListView(generics.ListAPIView):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuditor | IsITManager]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['action', 'module', 'user_email', 'record_id']
    search_fields = ['user_email', 'record_repr', 'record_id']
    ordering_fields = ['timestamp', 'user_email', 'module']
    ordering = ['-timestamp']


class AuditLogExportView(APIView):
    """GET /api/audit/export/?format=csv&action=&module=&user_email=&from_date=&to_date=
    Streams a CSV file of filtered audit log entries. Max 100,000 rows.
    Only Super Admin and IT Manager can export."""
    permission_classes = [IsAuditor | IsITManager]

    def get(self, request):
        qs = AuditLog.objects.all()
        # Apply same filters as AuditLogListView
        action = request.query_params.get('action')
        module = request.query_params.get('module')
        user_email = request.query_params.get('user_email')
        from_date = request.query_params.get('from_date')  # YYYY-MM-DD
        to_date = request.query_params.get('to_date')

        if action:
            qs = qs.filter(action=action)
        if module:
            qs = qs.filter(module=module)
        if user_email:
            qs = qs.filter(user_email__icontains=user_email)
        if from_date:
            qs = qs.filter(timestamp__date__gte=from_date)
        if to_date:
            qs = qs.filter(timestamp__date__lte=to_date)

        qs = qs.order_by('-timestamp')[:100000]

        # Log the export itself
        AuditLog.log(
            user=request.user,
            action=AuditLog.CREATE,
            module='audit_export',
            record_repr=f'Audit log export by {request.user.email}',
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="audit_log.csv"'

        writer = csv.writer(response)
        writer.writerow(['Timestamp', 'User Email', 'Action', 'Module', 'Record ID', 'Record', 'Field', 'Old Value', 'New Value', 'IP Address'])
        for entry in qs:
            writer.writerow([
                entry.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC'),
                entry.user_email,
                entry.get_action_display(),
                entry.module,
                entry.record_id,
                entry.record_repr,
                entry.field_name,
                str(entry.old_value) if entry.old_value else '',
                str(entry.new_value) if entry.new_value else '',
                entry.ip_address or '',
            ])

        return response
