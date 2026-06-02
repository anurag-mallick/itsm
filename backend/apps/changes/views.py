from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import IsITAgent, IsITManager
from apps.audit.models import AuditLog

from .models import ChangeComment, ChangeRequest, Sprint
from .serializers import (
    ArchiveActionSerializer,
    ChangeCommentCreateSerializer,
    ChangeCommentSerializer,
    ChangeCreateSerializer,
    ChangeDetailSerializer,
    ChangeListSerializer,
    ChangeUpdateSerializer,
    SprintCreateUpdateSerializer,
    SprintSerializer,
)

try:
    from django_filters.rest_framework import DjangoFilterBackend
except ImportError:
    DjangoFilterBackend = None

_filter_backends = [b for b in [DjangoFilterBackend, SearchFilter, OrderingFilter] if b is not None]


class ChangeListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/changes/ — list with filters, create new change."""

    filter_backends = _filter_backends
    filterset_fields = ['status', 'priority', 'change_type', 'assignee']
    search_fields = ['ref_number', 'title', 'description']
    ordering = ['-created_at']

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated(), IsITAgent()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        return ChangeRequest.objects.select_related('reporter', 'assignee').all()

    def get_serializer_class(self):
        return ChangeCreateSerializer if self.request.method == 'POST' else ChangeListSerializer

    def perform_create(self, serializer):
        change = serializer.save(reporter=self.request.user)
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module='changes',
            record_id=change.pk,
            record_repr=str(change),
            ip_address=getattr(self.request, 'audit_ip', self.request.META.get('REMOTE_ADDR')),
        )


class ChangeKanbanView(APIView):
    """GET /api/changes/kanban/ — returns changes grouped by status."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = ChangeRequest.objects.select_related('reporter', 'assignee').all()
        result = {}
        for status_key, _ in ChangeRequest.STATUS_CHOICES:
            items = qs.filter(status=status_key)
            result[status_key] = ChangeListSerializer(items, many=True).data
        return Response(result)


class ChangeDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/changes/{pk}/"""

    queryset = ChangeRequest.objects.select_related(
        'reporter', 'assignee'
    ).prefetch_related('comments__author')

    def get_permissions(self):
        if self.request.method in ('PUT', 'PATCH'):
            return [permissions.IsAuthenticated(), IsITAgent()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        return ChangeUpdateSerializer if self.request.method in ('PUT', 'PATCH') else ChangeDetailSerializer

    def perform_update(self, serializer):
        old = ChangeDetailSerializer(serializer.instance).data
        change = serializer.save()
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.UPDATE,
            module='changes',
            record_id=change.pk,
            record_repr=str(change),
            old_value=dict(old),
            new_value=ChangeDetailSerializer(change).data,
            ip_address=getattr(self.request, 'audit_ip', self.request.META.get('REMOTE_ADDR')),
        )


class ChangeAssignView(APIView):
    """POST /api/changes/{pk}/assign/ — body: {user_id: uuid | null}"""

    permission_classes = [permissions.IsAuthenticated, IsITAgent]

    def post(self, request, pk):
        change = get_object_or_404(ChangeRequest.all_records, pk=pk)
        uid = request.data.get('user_id')
        change.assignee = get_object_or_404(User, id=uid) if uid else None
        change.save(update_fields=['assignee'])
        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='changes',
            record_id=change.pk,
            record_repr=f'{change.ref_number} assigned',
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        return Response(ChangeDetailSerializer(change).data)


class ChangeStatusView(APIView):
    """POST /api/changes/{pk}/status/ — body: {status: string}"""

    permission_classes = [permissions.IsAuthenticated, IsITAgent]

    def post(self, request, pk):
        change = get_object_or_404(ChangeRequest.all_records, pk=pk)
        new_status = request.data.get('status')
        valid = [s[0] for s in ChangeRequest.STATUS_CHOICES]
        if new_status not in valid:
            return Response(
                {'detail': f'Invalid status. Choose from: {valid}'}, status=400
            )
        old_status = change.status
        change.status = new_status
        change.save(update_fields=['status'])
        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='changes',
            record_id=change.pk,
            record_repr=f'{change.ref_number} status: {old_status}→{new_status}',
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        return Response(ChangeDetailSerializer(change).data)


class ChangeCommentListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/changes/{pk}/comments/"""

    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ChangeComment.objects.filter(
            change_id=self.kwargs['pk']
        ).select_related('author')

    def get_serializer_class(self):
        return ChangeCommentCreateSerializer if self.request.method == 'POST' else ChangeCommentSerializer

    def perform_create(self, serializer):
        serializer.save(change_id=self.kwargs['pk'], author=self.request.user)


class ChangeArchiveView(APIView):
    """POST /api/changes/{pk}/archive/"""

    permission_classes = [permissions.IsAuthenticated, IsITManager]

    def post(self, request, pk):
        change = get_object_or_404(ChangeRequest.all_records, pk=pk, is_archived=False)
        serializer = ArchiveActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data['reason']
        change.is_archived = True
        change.archived_at = timezone.now()
        change.archived_by = request.user
        change.archive_reason = reason
        change.save(update_fields=['is_archived', 'archived_at', 'archived_by', 'archive_reason'])
        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='changes',
            record_id=change.pk,
            record_repr=f'{change.ref_number} archived',
            new_value={'archive_reason': reason},
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        return Response({'detail': f'{change.ref_number} archived.'})


class ArchivedChangeListView(generics.ListAPIView):
    """GET /api/changes/archived/ — lists all archived changes."""
    serializer_class = ChangeListSerializer
    permission_classes = [IsITAgent]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['ref_number', 'title']
    ordering = ['-archived_at']

    def get_queryset(self):
        return ChangeRequest.archived.select_related('reporter', 'assignee').all()


class ChangeUnarchiveView(APIView):
    """POST /api/changes/{pk}/unarchive/"""

    permission_classes = [permissions.IsAuthenticated, IsITManager]

    def post(self, request, pk):
        change = get_object_or_404(ChangeRequest.all_records, pk=pk, is_archived=True)
        serializer = ArchiveActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        change.is_archived = False
        change.archived_at = None
        change.archived_by = None
        change.save(update_fields=['is_archived', 'archived_at', 'archived_by'])
        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='changes',
            record_id=change.pk,
            record_repr=f'{change.ref_number} unarchived',
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        return Response({'detail': f'{change.ref_number} restored from archive.'})


# ── Sprint views ──────────────────────────────────────────────────────────────

class SprintListCreateView(generics.ListCreateAPIView):
    """GET /api/sprints/ — list, POST — create."""

    filter_backends = [b for b in [DjangoFilterBackend, SearchFilter, OrderingFilter] if b is not None]
    filterset_fields = ['status']
    search_fields = ['name']
    ordering = ['-created_at']

    def get_queryset(self):
        return Sprint.objects.prefetch_related('changes').all()

    def get_serializer_class(self):
        return SprintCreateUpdateSerializer if self.request.method == 'POST' else SprintSerializer

    def get_permissions(self):
        return [IsITManager()] if self.request.method == 'POST' else [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        sprint = serializer.save(created_by=self.request.user)
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module='sprints',
            record_id=sprint.pk,
            record_repr=str(sprint),
            ip_address=getattr(self.request, 'audit_ip', self.request.META.get('REMOTE_ADDR')),
        )


class SprintDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/sprints/{id}/"""

    queryset = Sprint.objects.prefetch_related('changes').all()

    def get_serializer_class(self):
        return SprintCreateUpdateSerializer if self.request.method in ('PUT', 'PATCH') else SprintSerializer

    def get_permissions(self):
        return [IsITManager()] if self.request.method in ('PUT', 'PATCH') else [permissions.IsAuthenticated()]


class SprintStartView(APIView):
    """POST /api/sprints/{id}/start/ — activate sprint (only one active sprint at a time)."""

    permission_classes = [IsITManager]

    def post(self, request, pk):
        sprint = get_object_or_404(Sprint, pk=pk, status=Sprint.PLANNING)
        if Sprint.objects.filter(status=Sprint.ACTIVE).exists():
            return Response(
                {'detail': 'Another sprint is already active. Complete it before starting a new one.'},
                status=400,
            )
        sprint.status = Sprint.ACTIVE
        sprint.save(update_fields=['status'])
        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='sprints',
            record_id=sprint.pk,
            record_repr=f'{sprint.name} started',
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        return Response(SprintSerializer(sprint).data)


class SprintCompleteView(APIView):
    """POST /api/sprints/{id}/complete/ — close sprint, move unfinished items to backlog (removes sprint FK)."""

    permission_classes = [IsITManager]

    def post(self, request, pk):
        sprint = get_object_or_404(Sprint, pk=pk, status=Sprint.ACTIVE)
        # Move incomplete changes back to backlog (remove sprint FK but keep status)
        sprint.changes.exclude(status='done').update(sprint=None)
        sprint.status = Sprint.COMPLETED
        sprint.save(update_fields=['status'])
        AuditLog.log(
            user=request.user,
            action=AuditLog.UPDATE,
            module='sprints',
            record_id=sprint.pk,
            record_repr=f'{sprint.name} completed',
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        return Response(SprintSerializer(sprint).data)


class SprintChangesView(APIView):
    """GET /api/sprints/{id}/changes/ — changes in this sprint grouped by status."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        get_object_or_404(Sprint, pk=pk)
        qs = ChangeRequest.objects.filter(sprint_id=pk).select_related('reporter', 'assignee')
        result = {}
        for status_key, _ in ChangeRequest.STATUS_CHOICES:
            items = qs.filter(status=status_key)
            result[status_key] = ChangeListSerializer(items, many=True).data
        return Response(result)


class ChangeSprintView(APIView):
    """POST /api/changes/{pk}/sprint/ — assign/remove change from a sprint. Body: {sprint_id: uuid | null}"""

    permission_classes = [IsITAgent]

    def post(self, request, pk):
        change = get_object_or_404(ChangeRequest.all_records, pk=pk)
        sprint_id = request.data.get('sprint_id')
        if sprint_id:
            sprint = get_object_or_404(Sprint, pk=sprint_id)
            change.sprint = sprint
        else:
            change.sprint = None
        change.save(update_fields=['sprint'])
        return Response(ChangeDetailSerializer(change).data)
