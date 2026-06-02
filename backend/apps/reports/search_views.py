from django.db import models
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions


class GlobalSearchView(APIView):
    """GET /api/search/?q=query — searches tickets, assets, changes, access requests."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        q = (request.query_params.get('q') or '').strip()
        if len(q) < 2:
            return Response({'results': [], 'total': 0})

        results = []
        user = request.user
        role = user.role.name if user.role else ''
        is_agent = role in ('it_agent', 'it_manager', 'super_admin')

        # Tickets
        try:
            from apps.tickets.models import Ticket
            qs = Ticket.objects.filter(is_archived=False)
            if role == 'requestor':
                qs = qs.filter(requestor=user)
            tickets = qs.filter(
                subject__icontains=q
            ).values('id', 'ticket_number', 'subject', 'status', 'priority')[:5]
            for t in tickets:
                results.append({
                    'type': 'ticket',
                    'type_label': 'Ticket',
                    'title': f"{t['ticket_number']}: {t['subject']}",
                    'subtitle': f"{t['status'].replace('_', ' ').title()} · {t['priority'].title()}",
                    'url': f"/tickets/{t['id']}",
                    'id': str(t['id']),
                })
        except Exception:
            pass

        # Hardware Assets
        if is_agent:
            try:
                from apps.assets.models import HardwareAsset
                assets = HardwareAsset.objects.filter(is_archived=False).filter(
                    models.Q(name__icontains=q) |
                    models.Q(asset_tag__icontains=q) |
                    models.Q(serial_number__icontains=q)
                ).values('id', 'asset_tag', 'name', 'status')[:5]
                for a in assets:
                    results.append({
                        'type': 'asset',
                        'type_label': 'Hardware Asset',
                        'title': f"{a['asset_tag']} — {a['name']}",
                        'subtitle': a['status'].replace('_', ' ').title(),
                        'url': f"/assets/hardware/{a['id']}",
                        'id': str(a['id']),
                    })
            except Exception:
                pass

        # Changes
        if is_agent:
            try:
                from apps.changes.models import ChangeRequest
                changes = ChangeRequest.objects.filter(
                    is_archived=False
                ).filter(
                    models.Q(title__icontains=q) | models.Q(ref_number__icontains=q)
                ).values('id', 'ref_number', 'title', 'status')[:5]
                for c in changes:
                    results.append({
                        'type': 'change',
                        'type_label': 'Change',
                        'title': f"{c['ref_number']}: {c['title']}",
                        'subtitle': c['status'].replace('_', ' ').title(),
                        'url': f"/changes/{c['id']}",
                        'id': str(c['id']),
                    })
            except Exception:
                pass

        # Access Requests
        try:
            from apps.access_requests.models import AccessRequest
            ar_qs = AccessRequest.objects.all()
            if role == 'requestor':
                ar_qs = ar_qs.filter(requested_by=user)
            ars = ar_qs.filter(
                models.Q(ref_number__icontains=q) |
                models.Q(justification__icontains=q) |
                models.Q(software_name__icontains=q) |
                models.Q(hardware_type__icontains=q)
            ).values('id', 'ref_number', 'request_type', 'status')[:5]
            for ar in ars:
                results.append({
                    'type': 'access_request',
                    'type_label': 'Access Request',
                    'title': f"{ar['ref_number']} — {ar['request_type'].title()} Request",
                    'subtitle': ar['status'].replace('_', ' ').title(),
                    'url': f"/access-requests/{ar['id']}",
                    'id': str(ar['id']),
                })
        except Exception:
            pass

        return Response({'results': results, 'total': len(results), 'query': q})
