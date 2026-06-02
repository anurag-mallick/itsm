from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from datetime import timedelta
from apps.accounts.permissions import IsITAgent, IsITManager


class DashboardStatsView(APIView):
    """GET /api/reports/dashboard/ — returns all stat counts for the dashboard."""
    permission_classes = [IsITAgent]

    def get(self, request):
        from apps.tickets.models import Ticket
        from apps.assets.models import HardwareAsset
        from apps.software.models import SoftwareLicense

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        return Response({
            # Tickets
            'open_tickets': Ticket.objects.filter(status='open').count(),
            'in_progress_tickets': Ticket.objects.filter(status='in_progress').count(),
            'pending_tickets': Ticket.objects.filter(status='pending_info').count(),
            'sla_breaching': Ticket.objects.filter(sla_breached=True, status__in=['open', 'in_progress', 'pending_info']).count(),
            'unassigned_tickets': Ticket.objects.filter(assignee=None, status__in=['open', 'in_progress']).count(),
            'resolved_today': Ticket.objects.filter(resolved_at__gte=today_start).count(),
            'my_open_tickets': Ticket.objects.filter(assignee=request.user, status__in=['open', 'in_progress', 'pending_info']).count(),
            # Assets
            'active_hardware': HardwareAsset.objects.filter(status='active').count(),
            'under_repair': HardwareAsset.objects.filter(status='under_repair').count(),
            'warranty_expiring_30d': HardwareAsset.objects.filter(
                warranty_expiry__lte=now.date() + timedelta(days=30),
                warranty_expiry__gte=now.date(),
                status__in=['active', 'under_repair']
            ).count(),
            # Software
            'total_licenses': SoftwareLicense.objects.filter(is_active=True).count(),
            'licenses_expiring_30d': SoftwareLicense.objects.filter(
                expiry_date__lte=now.date() + timedelta(days=30),
                expiry_date__gte=now.date(),
                is_active=True
            ).count(),
            'licenses_expired': SoftwareLicense.objects.filter(
                expiry_date__lt=now.date(),
                is_active=True
            ).count(),
        })


class TicketReportView(APIView):
    """GET /api/reports/tickets/ — ticket counts grouped by status and priority."""
    permission_classes = [IsITManager]

    def get(self, request):
        from apps.tickets.models import Ticket
        from django.db.models import Count

        by_status = list(Ticket.objects.values('status').annotate(count=Count('id')).order_by('status'))
        by_priority = list(Ticket.objects.values('priority').annotate(count=Count('id')).order_by('priority'))
        by_category = list(
            Ticket.objects.values('category__name').annotate(count=Count('id')).order_by('-count')[:10]
        )

        return Response({
            'by_status': by_status,
            'by_priority': by_priority,
            'by_category': by_category,
        })


class AssetReportView(APIView):
    """GET /api/reports/assets/ — asset counts by type and status."""
    permission_classes = [IsITManager]

    def get(self, request):
        from apps.assets.models import HardwareAsset
        from django.db.models import Count

        by_status = list(HardwareAsset.objects.values('status').annotate(count=Count('id')).order_by('status'))
        by_type = list(HardwareAsset.objects.values('asset_type').annotate(count=Count('id')).order_by('-count'))

        return Response({'by_status': by_status, 'by_type': by_type})
