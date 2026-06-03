import logging

from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsSuperAdmin
from apps.audit.models import AuditLog

from .models import InboundMailbox
from .serializers import InboundMailboxSerializer

logger = logging.getLogger('itsm.email')


class InboundMailboxListCreateView(generics.ListCreateAPIView):
    """GET /api/email-config/inbound/ — list all mailboxes (Super Admin only)."""

    queryset = InboundMailbox.objects.select_related('default_category').all()
    serializer_class = InboundMailboxSerializer
    permission_classes = [IsSuperAdmin]

    def perform_create(self, serializer):
        mailbox = serializer.save()
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module='email_config',
            record_id=mailbox.pk,
            record_repr=str(mailbox),
            ip_address=getattr(self.request, 'audit_ip', None),
        )


class InboundMailboxDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/email-config/inbound/{id}/"""

    queryset = InboundMailbox.objects.all()
    serializer_class = InboundMailboxSerializer
    permission_classes = [IsSuperAdmin]


class InboundMailboxTestView(APIView):
    """POST /api/email-config/inbound/{id}/test/ — test IMAP/POP3 connectivity."""

    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        mailbox = get_object_or_404(InboundMailbox, pk=pk)
        if mailbox.protocol == InboundMailbox.IMAP:
            result = _test_imap(mailbox)
        else:
            result = _test_pop3(mailbox)
        return Response(result)


def _test_imap(mailbox: InboundMailbox) -> dict:
    try:
        import imapclient

        conn = imapclient.IMAPClient(
            mailbox.host, port=mailbox.port, ssl=mailbox.use_ssl, timeout=10
        )
        conn.login(mailbox.username, mailbox.password)
        folders = [str(f[2]) for f in conn.list_folders()]
        count = conn.select_folder(mailbox.imap_folder, readonly=True)
        conn.logout()
        return {
            'success': True,
            'protocol': 'IMAP',
            'message': (
                f'Connected successfully. {count["EXISTS"]} message(s) in {mailbox.imap_folder}.'
            ),
            'folders': folders[:20],
        }
    except Exception as e:
        return {'success': False, 'protocol': 'IMAP', 'message': str(e)}


def _test_pop3(mailbox: InboundMailbox) -> dict:
    try:
        import poplib

        if mailbox.use_ssl:
            conn = poplib.POP3_SSL(mailbox.host, mailbox.port)
        else:
            conn = poplib.POP3(mailbox.host, mailbox.port)
        conn.user(mailbox.username)
        conn.pass_(mailbox.password)
        count, size = conn.stat()
        conn.quit()
        return {
            'success': True,
            'protocol': 'POP3',
            'message': f'Connected successfully. {count} message(s) ({size} bytes).',
        }
    except Exception as e:
        return {'success': False, 'protocol': 'POP3', 'message': str(e)}


class TriggerPollView(APIView):
    """POST /api/email-config/inbound/{id}/poll-now/ — manually trigger a poll."""

    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        mailbox = get_object_or_404(InboundMailbox, pk=pk, is_active=True)
        from apps.email_processor.tasks import poll_single_mailbox

        poll_single_mailbox.delay(str(mailbox.id))
        return Response({'detail': f'Poll triggered for {mailbox.email_address}.'})
