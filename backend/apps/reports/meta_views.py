"""
GET /api/meta/choices/
Returns all model choices (statuses, priorities, types) so the frontend
never needs hardcoded option lists.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions


def _choices(pairs):
    return [{'value': v, 'label': l} for v, l in pairs]


class MetaChoicesView(APIView):
    """GET /api/meta/choices/ — all enum choices for every module."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.tickets.models import Ticket
        from apps.assets.models import HardwareAsset
        from apps.software.models import SoftwareLicense
        from apps.changes.models import ChangeRequest, Sprint
        from apps.accounts.models import Role

        return Response({
            'ticket': {
                'statuses':   _choices(Ticket.STATUS_CHOICES),
                'priorities': _choices(Ticket.PRIORITY_CHOICES),
                'sources':    _choices(Ticket.SOURCE_CHOICES),
            },
            'asset': {
                'statuses': _choices(HardwareAsset.STATUS_CHOICES),
                'types':    _choices(HardwareAsset.ASSET_TYPE_CHOICES),
            },
            'software': {
                'license_types': _choices(SoftwareLicense.LICENSE_TYPE_CHOICES),
            },
            'change': {
                'statuses': _choices(ChangeRequest.STATUS_CHOICES),
                'types':    _choices(ChangeRequest.CHANGE_TYPE_CHOICES),
                'priorities': _choices(ChangeRequest.PRIORITY_CHOICES),
            },
            'sprint': {
                'statuses': _choices(Sprint.STATUS_CHOICES),
            },
            'role': {
                'names': _choices(Role.ROLE_CHOICES),
            },
        })
