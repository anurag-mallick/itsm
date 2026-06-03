from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.accounts.permissions import IsITAgent, IsITManager
from apps.audit.mixins import AuditMixin
from apps.audit.models import AuditLog

from .models import Attachment, CannedResponse, Category, Comment, Ticket
from .serializers import (
    ArchiveActionSerializer,
    AttachmentSerializer,
    CannedResponseSerializer,
    CategorySerializer,
    CommentCreateSerializer,
    CommentSerializer,
    TicketCreateSerializer,
    TicketDetailSerializer,
    TicketListSerializer,
    TicketUpdateSerializer,
)
from .tasks import send_ticket_notification

try:
    from django_filters.rest_framework import DjangoFilterBackend
except ImportError:
    DjangoFilterBackend = None


def _notify(user, notif_type, title, body='', url=''):
    """Create an in-app notification, silently ignore any errors."""
    if not user or not user.is_authenticated:
        return
    try:
        from apps.notifications.models import Notification
        Notification.create(user=user, notification_type=notif_type, title=title, body=body, url=url)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Category views
# ---------------------------------------------------------------------------

class CategoryListCreateView(AuditMixin, generics.ListCreateAPIView):
    serializer_class = CategorySerializer
    audit_module = 'tickets'

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated(), IsITManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        return Category.objects.filter(is_active=True).select_related('parent', 'default_assignee')


class CategoryDetailView(AuditMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CategorySerializer
    audit_module = 'tickets'

    def get_permissions(self):
        if self.request.method in ('PUT', 'PATCH', 'DELETE'):
            return [permissions.IsAuthenticated(), IsITManager()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        return Category.objects.all().select_related('parent', 'default_assignee')


# ---------------------------------------------------------------------------
# Ticket views
# ---------------------------------------------------------------------------

def _is_agent_or_manager(user):
    """Return True when the user has an IT agent, IT manager, or super admin role."""
    if not user or not user.is_authenticated or not user.role:
        return False
    return user.role.name in (Role.IT_AGENT, Role.IT_MANAGER, Role.SUPER_ADMIN)


class TicketListCreateView(AuditMixin, generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    audit_module = 'tickets'

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return TicketCreateSerializer
        return TicketListSerializer

    def get_queryset(self):
        qs = Ticket.objects.filter(is_archived=False).select_related(
            'category', 'requestor', 'assignee'
        ).order_by('-created_at')
        if not _is_agent_or_manager(self.request.user):
            qs = qs.filter(requestor=self.request.user)

        # Optional query param filters
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('priority'):
            qs = qs.filter(priority=params['priority'])
        if params.get('assignee'):
            qs = qs.filter(assignee__email=params['assignee'])
        if params.get('category'):
            qs = qs.filter(category_id=params['category'])
        if params.get('search'):
            search = params['search']
            qs = qs.filter(
                Q(subject__icontains=search) | Q(ticket_number__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        with transaction.atomic():
            instance = serializer.save()
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module='tickets',
            record_id=str(instance.pk),  # UUID string for consistent filtering
            record_repr=f'{instance.ticket_number} created: {instance.subject}',
            new_value={'ticket_number': instance.ticket_number, 'subject': instance.subject,
                       'priority': instance.priority, 'status': instance.status},
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )
        send_ticket_notification.delay(str(instance.id), 'created')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class TicketDetailView(AuditMixin, generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    audit_module = 'tickets'

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return TicketUpdateSerializer
        return TicketDetailSerializer

    def get_queryset(self):
        qs = Ticket.objects.select_related(
            'category', 'requestor', 'assignee', 'archived_by'
        ).prefetch_related(
            'comments__author',
            'comments__attachments',
            'attachments__uploaded_by',
        )
        if not _is_agent_or_manager(self.request.user):
            qs = qs.filter(requestor=self.request.user)
        return qs

    def perform_update(self, serializer):
        old_status = serializer.instance.status
        old_data = TicketUpdateSerializer(serializer.instance).data
        instance = serializer.save()
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.UPDATE,
            module='tickets',
            record_id=instance.pk,
            record_repr=str(instance),
            old_value=dict(old_data),
            new_value=TicketUpdateSerializer(instance).data,
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )
        if instance.status != old_status:
            event = 'resolved' if instance.status == Ticket.RESOLVED else \
                    'closed' if instance.status == Ticket.CLOSED else 'status_changed'
            send_ticket_notification.delay(str(instance.id), event)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class TicketAssignView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsITAgent]

    def post(self, request, pk):
        from apps.accounts.models import User

        with transaction.atomic():
            # select_for_update acquires a row-level lock — prevents double-assignment
            ticket = get_object_or_404(
                Ticket.all_records.select_for_update(), pk=pk
            )
            assignee_id = request.data.get('assignee')
            if not assignee_id:
                return Response(
                    {'detail': 'assignee field is required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                assignee = User.objects.get(pk=assignee_id)
            except User.DoesNotExist:
                return Response(
                    {'detail': 'Assignee not found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            old_assignee = ticket.assignee
            ticket.assignee = assignee
            ticket.save(update_fields=['assignee', 'updated_at'])

        # Audit log and notifications run outside the transaction
        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='tickets',
            record_id=ticket.pk,
            record_repr=str(ticket),
            field_name='assignee',
            old_value=str(old_assignee.pk) if old_assignee else None,
            new_value=str(assignee.pk),
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        send_ticket_notification.delay(str(ticket.id), 'assigned')
        if ticket.assignee:
            _notify(
                ticket.assignee,
                'ticket_assigned',
                f'Ticket {ticket.ticket_number} assigned to you',
                ticket.subject,
                f'/tickets/{ticket.id}',
            )
        return Response(TicketDetailSerializer(ticket, context={'request': request}).data)


class TicketStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsITAgent]

    def post(self, request, pk):
        with transaction.atomic():
            # select_for_update acquires a row-level lock — prevents concurrent status races
            ticket = get_object_or_404(
                Ticket.all_records.select_for_update(), pk=pk
            )
            new_status = (request.data.get('status') or '').strip()
            resolution_notes = (request.data.get('resolution_notes') or '').strip()

            if not new_status:
                return Response(
                    {'detail': 'status is required.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            old_status = ticket.status
            try:
                ticket.transition_to(
                    new_status,
                    resolution_notes=resolution_notes,
                    actor=request.user,
                )
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Audit log and notifications run outside the transaction
        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='tickets',
            record_id=ticket.pk,
            record_repr=str(ticket),
            field_name='status',
            old_value=old_status,
            new_value=new_status,
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )

        event = 'resolved' if new_status == Ticket.RESOLVED else \
                'closed' if new_status == Ticket.CLOSED else 'status_changed'
        send_ticket_notification.delay(str(ticket.id), event)

        return Response(TicketDetailSerializer(ticket, context={'request': request}).data)


# ---------------------------------------------------------------------------
# Archive views
# ---------------------------------------------------------------------------

class TicketArchiveView(APIView):
    """POST /api/tickets/{pk}/archive/ — archive a ticket with a mandatory reason."""
    permission_classes = [IsITAgent]

    def post(self, request, pk):
        ticket = get_object_or_404(Ticket.all_records, pk=pk, is_archived=False)
        serializer = ArchiveActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data['reason']

        ticket.is_archived = True
        ticket.archived_at = timezone.now()
        ticket.archived_by = request.user
        ticket.archive_reason = reason
        ticket.save(update_fields=['is_archived', 'archived_at', 'archived_by', 'archive_reason'])

        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='tickets',
            record_id=str(ticket.pk),
            record_repr=f'{ticket.ticket_number} archived',
            new_value={'archive_reason': reason},
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        return Response({'detail': f'Ticket {ticket.ticket_number} archived.'})


class TicketUnarchiveView(APIView):
    """POST /api/tickets/{pk}/unarchive/ — restore an archived ticket with reason."""
    permission_classes = [IsITManager]

    def post(self, request, pk):
        ticket = get_object_or_404(Ticket.all_records, pk=pk, is_archived=True)
        serializer = ArchiveActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data['reason']

        ticket.is_archived = False
        ticket.archived_at = None
        ticket.archived_by = None
        ticket.archive_reason = ''
        ticket.save(update_fields=['is_archived', 'archived_at', 'archived_by', 'archive_reason'])

        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='tickets',
            record_id=str(ticket.pk),
            record_repr=f'{ticket.ticket_number} unarchived',
            new_value={'unarchive_reason': reason},
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        return Response({'detail': f'Ticket {ticket.ticket_number} restored from archive.'})


class ArchivedTicketListView(generics.ListAPIView):
    """GET /api/tickets/archived/ — lists all archived tickets. IT Agent+ only."""
    serializer_class = TicketListSerializer
    permission_classes = [IsITAgent]
    filter_backends = [f for f in [DjangoFilterBackend, SearchFilter, OrderingFilter] if f is not None]
    search_fields = ['ticket_number', 'subject', 'requestor__email']
    ordering = ['-archived_at']

    def get_queryset(self):
        return Ticket.archived.select_related(
            'category', 'requestor', 'assignee', 'archived_by'
        ).all()


# ---------------------------------------------------------------------------
# Comment views
# ---------------------------------------------------------------------------

class CommentListCreateView(AuditMixin, generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    audit_module = 'tickets'

    def _get_ticket(self):
        qs = Ticket.objects.all()
        if not _is_agent_or_manager(self.request.user):
            qs = qs.filter(requestor=self.request.user)
        return get_object_or_404(qs, pk=self.kwargs['pk'])

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return CommentCreateSerializer
        return CommentSerializer

    def get_queryset(self):
        ticket = self._get_ticket()
        qs = Comment.objects.filter(ticket=ticket).select_related('author').prefetch_related('attachments')
        # Requestors cannot see internal notes
        if not _is_agent_or_manager(self.request.user):
            qs = qs.filter(comment_type=Comment.REPLY)
        return qs

    def perform_create(self, serializer):
        ticket = self._get_ticket()
        instance = serializer.save(ticket=ticket, author=self.request.user)
        # Store record_id = TICKET pk so ActivityFeed queries work correctly
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module='tickets',
            record_id=str(ticket.pk),          # ticket UUID, not comment UUID
            record_repr=f'Comment on {ticket.ticket_number}: {instance.body[:80]}',
            new_value={'comment_type': instance.comment_type, 'body': instance.body[:200]},
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )
        if instance.comment_type == Comment.REPLY:
            send_ticket_notification.delay(str(ticket.id), 'commented', comment_id=str(instance.id))
            if ticket.requestor != instance.author:
                _notify(
                    ticket.requestor,
                    'ticket_commented',
                    f'New reply on {ticket.ticket_number}',
                    instance.body[:100],
                    f'/tickets/{ticket.id}',
                )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        context['ticket'] = self._get_ticket()
        return context


# ---------------------------------------------------------------------------
# Attachment views
# ---------------------------------------------------------------------------

class AttachmentUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        ticket = get_object_or_404(Ticket, pk=pk)
        if not _is_agent_or_manager(request.user) and ticket.requestor != request.user:
            raise PermissionDenied('You do not have permission to attach files to this ticket.')

        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'detail': 'file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        comment_id = request.data.get('comment')
        comment = None
        if comment_id:
            comment = get_object_or_404(Comment, pk=comment_id, ticket=ticket)

        attachment = Attachment.objects.create(
            ticket=ticket,
            comment=comment,
            file=uploaded_file,
            original_filename=uploaded_file.name,
            file_size=uploaded_file.size,
            uploaded_by=request.user,
        )
        return Response(AttachmentSerializer(attachment, context={'request': request}).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Canned response views
# ---------------------------------------------------------------------------

class CannedResponseListCreateView(AuditMixin, generics.ListCreateAPIView):
    serializer_class = CannedResponseSerializer
    permission_classes = [permissions.IsAuthenticated, IsITAgent]
    audit_module = 'tickets'

    def get_queryset(self):
        from django.db.models import Q
        qs = CannedResponse.objects.filter(is_active=True).select_related('category', 'created_by')
        # Agents see global responses plus their own personal ones
        qs = qs.filter(Q(scope=CannedResponse.GLOBAL) | Q(created_by=self.request.user))
        category_id = self.request.query_params.get('category')
        if category_id:
            qs = qs.filter(category_id=category_id)
        return qs

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module='tickets',
            record_id=instance.pk,
            record_repr=str(instance),
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class CannedResponseDetailView(AuditMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CannedResponseSerializer
    permission_classes = [permissions.IsAuthenticated, IsITAgent]
    audit_module = 'tickets'

    def get_queryset(self):
        from django.db.models import Q
        return CannedResponse.objects.filter(
            Q(scope=CannedResponse.GLOBAL) | Q(created_by=self.request.user)
        ).select_related('category', 'created_by')

    def perform_update(self, serializer):
        instance = serializer.instance
        if instance.scope == CannedResponse.PERSONAL and instance.created_by != self.request.user:
            raise PermissionDenied('You can only edit your own personal canned responses.')
        old_data = CannedResponseSerializer(instance).data
        updated = serializer.save()
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.UPDATE,
            module='tickets',
            record_id=updated.pk,
            record_repr=str(updated),
            old_value=dict(old_data),
            new_value=CannedResponseSerializer(updated).data,
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )

    def perform_destroy(self, instance):
        if instance.scope == CannedResponse.PERSONAL and instance.created_by != self.request.user:
            raise PermissionDenied('You can only delete your own personal canned responses.')
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.DELETE,
            module='tickets',
            record_id=instance.pk,
            record_repr=str(instance),
            ip_address=self._ip(),
            user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
        )
        instance.delete()
