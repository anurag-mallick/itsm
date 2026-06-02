from datetime import date, timedelta

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView


class CalendarEventsView(APIView):
    """
    GET /api/calendar/events/?from=YYYY-MM-DD&to=YYYY-MM-DD

    Returns all events (ticket SLAs, change due dates, sprint boundaries,
    license expiry, warranty expiry) in the given date range.

    Each event: {id, type, title, date, url, priority, status, color}
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        try:
            from_date = date.fromisoformat(from_str) if from_str else date.today().replace(day=1)
            to_date = date.fromisoformat(to_str) if to_str else from_date.replace(day=28) + timedelta(days=4)
            to_date = to_date.replace(day=1) - timedelta(days=1) if not to_str else to_date
        except ValueError:
            return Response({'detail': 'Invalid date format. Use YYYY-MM-DD.'}, status=400)

        events = []

        # Ticket SLA due dates
        try:
            from apps.tickets.models import Ticket
            tickets = Ticket.objects.filter(
                sla_due_at__date__gte=from_date,
                sla_due_at__date__lte=to_date,
                status__in=['open', 'in_progress', 'pending_info'],
            ).select_related('requestor')[:200]
            for t in tickets:
                events.append({
                    'id': f'ticket-sla-{t.id}',
                    'type': 'ticket_sla',
                    'title': f'SLA: {t.ticket_number} — {t.subject[:50]}',
                    'date': t.sla_due_at.date().isoformat(),
                    'url': f'/tickets/{t.id}',
                    'priority': t.priority,
                    'status': t.status,
                    'color': '#ff4d4f' if t.sla_breached else '#faad14',
                })
        except Exception:
            pass

        # Change due dates
        try:
            from apps.changes.models import ChangeRequest
            changes = ChangeRequest.objects.filter(
                due_date__gte=from_date,
                due_date__lte=to_date,
            ).select_related('assignee')[:200]
            for c in changes:
                events.append({
                    'id': f'change-{c.id}',
                    'type': 'change_due',
                    'title': f'{c.ref_number}: {c.title[:50]}',
                    'date': c.due_date.isoformat(),
                    'url': f'/changes/{c.id}',
                    'priority': c.priority,
                    'status': c.status,
                    'color': '#1677ff',
                })
        except Exception:
            pass

        # Sprint start and end dates
        try:
            from django.db.models import Q

            from apps.changes.models import Sprint
            sprints = Sprint.objects.filter(
                Q(start_date__gte=from_date, start_date__lte=to_date)
                | Q(end_date__gte=from_date, end_date__lte=to_date)
            )[:50]
            for s in sprints:
                if s.start_date and from_date <= s.start_date <= to_date:
                    events.append({
                        'id': f'sprint-start-{s.id}',
                        'type': 'sprint_start',
                        'title': f'Sprint Start: {s.name}',
                        'date': s.start_date.isoformat(),
                        'url': f'/sprints/{s.id}',
                        'color': '#52c41a',
                    })
                if s.end_date and from_date <= s.end_date <= to_date:
                    events.append({
                        'id': f'sprint-end-{s.id}',
                        'type': 'sprint_end',
                        'title': f'Sprint End: {s.name}',
                        'date': s.end_date.isoformat(),
                        'url': f'/sprints/{s.id}',
                        'color': '#d4380d',
                    })
        except Exception:
            pass

        # Software license expiry
        try:
            from apps.software.models import SoftwareLicense
            licenses = SoftwareLicense.objects.filter(
                expiry_date__gte=from_date,
                expiry_date__lte=to_date,
                is_active=True,
            )[:200]
            for lic in licenses:
                events.append({
                    'id': f'license-{lic.id}',
                    'type': 'license_expiry',
                    'title': f'License Expiry: {lic.name}',
                    'date': lic.expiry_date.isoformat(),
                    'url': '/assets/software',
                    'color': '#fa8c16',
                })
        except Exception:
            pass

        # Hardware warranty expiry
        try:
            from apps.assets.models import HardwareAsset
            assets = HardwareAsset.objects.filter(
                warranty_expiry__gte=from_date,
                warranty_expiry__lte=to_date,
                status__in=['active', 'under_repair'],
            )[:200]
            for asset in assets:
                events.append({
                    'id': f'warranty-{asset.id}',
                    'type': 'warranty_expiry',
                    'title': f'Warranty Expiry: {asset.asset_tag} {asset.name}',
                    'date': asset.warranty_expiry.isoformat(),
                    'url': f'/assets/hardware/{asset.id}',
                    'color': '#d3adf7',
                })
        except Exception:
            pass

        # Sort by date
        events.sort(key=lambda e: e['date'])
        return Response(events)
