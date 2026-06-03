from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from apps.accounts.permissions import IsSuperAdmin, IsITManager
from apps.audit.models import AuditLog

from .models import WorkflowRule
from .serializers import WorkflowRuleSerializer


class WorkflowRuleListCreateView(generics.ListCreateAPIView):
    queryset = WorkflowRule.objects.all()
    serializer_class = WorkflowRuleSerializer
    permission_classes = [IsITManager]

    def perform_create(self, serializer):
        rule = serializer.save(created_by=self.request.user)
        AuditLog.log(
            user=self.request.user,
            action=AuditLog.CREATE,
            module='workflows',
            record_id=rule.pk,
            record_repr=str(rule),
            ip_address=getattr(self.request, 'audit_ip', None),
        )


class WorkflowRuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = WorkflowRule.objects.all()
    serializer_class = WorkflowRuleSerializer
    permission_classes = [IsITManager]


class WorkflowTestView(APIView):
    """POST /api/workflows/{id}/test/ — test a rule against an existing ticket."""
    permission_classes = [IsITManager]

    def post(self, request, pk):
        rule = get_object_or_404(WorkflowRule, pk=pk)
        ticket_id = request.data.get('ticket_id')
        if not ticket_id:
            return Response({'detail': 'ticket_id is required.'}, status=400)

        from apps.tickets.models import Ticket
        try:
            ticket = Ticket.all_records.select_related(
                'category', 'requestor', 'assignee'
            ).get(id=ticket_id)
        except Ticket.DoesNotExist:
            return Response({'detail': 'Ticket not found.'}, status=404)

        from .engine import evaluate_rule, evaluate_condition
        matches = evaluate_rule(ticket, rule)
        condition_results = [
            {'condition': c, 'result': evaluate_condition(ticket, c)}
            for c in rule.conditions
        ]
        return Response({
            'rule': rule.name,
            'ticket': ticket.ticket_number,
            'overall_match': matches,
            'condition_results': condition_results,
        })


class WorkflowFieldsView(APIView):
    """GET /api/workflows/fields/ — available condition fields and operators."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.tickets.models import Category
        cats = list(Category.objects.filter(is_active=True).values('id', 'name'))

        from apps.accounts.models import User, Role
        agents = list(
            User.objects.filter(
                role__name__in=[Role.IT_AGENT, Role.IT_MANAGER, Role.SUPER_ADMIN],
                is_active=True,
            ).values('id', 'email')
        )

        return Response({
            'condition_fields': [
                {
                    'value': 'priority',
                    'label': 'Priority',
                    'type': 'select',
                    'options': ['low', 'medium', 'high', 'critical'],
                },
                {
                    'value': 'status',
                    'label': 'Status',
                    'type': 'select',
                    'options': ['open', 'in_progress', 'pending_info', 'resolved', 'closed'],
                },
                {
                    'value': 'source',
                    'label': 'Source',
                    'type': 'select',
                    'options': ['portal', 'email', 'teams'],
                },
                {
                    'value': 'category_id',
                    'label': 'Category',
                    'type': 'select',
                    'options': [{'value': str(c['id']), 'label': c['name']} for c in cats],
                },
                {'value': 'requestor_email', 'label': 'Requestor Email', 'type': 'text'},
                {'value': 'subject',         'label': 'Subject',         'type': 'text'},
                {'value': 'description',     'label': 'Description',     'type': 'text'},
                {
                    'value': 'assignee_id',
                    'label': 'Assignee',
                    'type': 'select',
                    'options': [{'value': str(u['id']), 'label': u['email']} for u in agents],
                },
            ],
            'operators': [
                {'value': 'equals',       'label': 'Equals',            'applicable': ['select', 'text']},
                {'value': 'not_equals',   'label': 'Does not equal',    'applicable': ['select', 'text']},
                {'value': 'contains',     'label': 'Contains',          'applicable': ['text']},
                {'value': 'not_contains', 'label': 'Does not contain',  'applicable': ['text']},
                {'value': 'starts_with',  'label': 'Starts with',       'applicable': ['text']},
                {'value': 'in',           'label': 'Is one of',         'applicable': ['select']},
                {'value': 'not_in',       'label': 'Is not one of',     'applicable': ['select']},
                {'value': 'is_empty',     'label': 'Is empty',          'applicable': ['select', 'text']},
                {'value': 'is_not_empty', 'label': 'Is not empty',      'applicable': ['select', 'text']},
            ],
            'action_types': [
                {'value': 'assign_to',         'label': 'Assign to agent',   'input': 'agent'},
                {'value': 'set_priority',      'label': 'Set priority',       'input': 'select', 'options': ['low', 'medium', 'high', 'critical']},
                {'value': 'set_category',      'label': 'Set category',       'input': 'category'},
                {'value': 'set_status',        'label': 'Set status',         'input': 'select', 'options': ['open', 'in_progress', 'pending_info', 'resolved', 'closed']},
                {'value': 'add_note',          'label': 'Add internal note',  'input': 'text'},
                {'value': 'send_notification', 'label': 'Notify agent',       'input': 'agent'},
            ],
            'agents': agents,
            'categories': cats,
        })
