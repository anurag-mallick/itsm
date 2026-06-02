from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsITAgent
from apps.tickets.models import Ticket

from .models import ProblemRecord
from .serializers import (
    LinkTicketSerializer,
    ProblemCreateSerializer,
    ProblemDetailSerializer,
    ProblemListSerializer,
    ProblemUpdateSerializer,
)


class ProblemListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/problems/ — list all problem records.
    POST /api/problems/ — create a new problem record.
    """
    permission_classes = [IsITAgent]
    queryset = ProblemRecord.objects.select_related('owner').prefetch_related(
        'linked_tickets'
    )
    filterset_fields = ['status', 'priority', 'owner']
    search_fields = ['ref_number', 'title', 'description']
    ordering_fields = ['created_at', 'updated_at', 'priority', 'status']

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ProblemCreateSerializer
        return ProblemListSerializer


class ProblemDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/problems/{id}/ — problem detail.
    PATCH /api/problems/{id}/ — update fields.
    """
    permission_classes = [IsITAgent]
    queryset = ProblemRecord.objects.select_related('owner').prefetch_related(
        'linked_tickets'
    )

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return ProblemUpdateSerializer
        return ProblemDetailSerializer


class ProblemLinkTicketView(APIView):
    """POST /api/problems/{id}/link-ticket/ — body: {ticket_id: <uuid>}"""
    permission_classes = [IsITAgent]

    def post(self, request, pk):
        problem = get_object_or_404(ProblemRecord, pk=pk)
        serializer = LinkTicketSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ticket = Ticket.objects.get(pk=serializer.validated_data['ticket_id'])
        problem.linked_tickets.add(ticket)

        return Response(ProblemDetailSerializer(problem, context={'request': request}).data)


class ProblemUnlinkTicketView(APIView):
    """POST /api/problems/{id}/unlink-ticket/ — body: {ticket_id: <uuid>}"""
    permission_classes = [IsITAgent]

    def post(self, request, pk):
        problem = get_object_or_404(ProblemRecord, pk=pk)
        serializer = LinkTicketSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        ticket_id = serializer.validated_data['ticket_id']
        try:
            ticket = Ticket.objects.get(pk=ticket_id)
            problem.linked_tickets.remove(ticket)
        except Ticket.DoesNotExist:
            pass  # already unlinked or never linked — treat as success

        # Re-fetch after modification
        problem.refresh_from_db()
        return Response(ProblemDetailSerializer(problem, context={'request': request}).data)
