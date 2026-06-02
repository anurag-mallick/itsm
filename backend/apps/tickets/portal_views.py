"""Public endpoints — no authentication required — for the guest ticket portal."""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from .models import Ticket, Category
from .serializers import TicketListSerializer
from apps.accounts.models import User
from apps.audit.models import AuditLog


class PortalCategoryListView(APIView):
    """GET /api/portal/categories/ — public list of active categories for the submission form."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        cats = Category.objects.filter(is_active=True).values('id', 'name', 'sla_response_hours')
        return Response(list(cats))


class PortalTicketSubmitView(APIView):
    """
    POST /api/portal/submit/
    Public endpoint — guests submit a ticket without logging in.
    Body: {name, email, subject, description, priority, category_id (optional), custom_fields}
    Auto-creates a guest account if the email is not already registered.
    Returns: {ticket_number, subject, status, message}
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        email = (request.data.get('email') or '').strip().lower()
        subject = (request.data.get('subject') or '').strip()
        description = (request.data.get('description') or '').strip()
        priority = request.data.get('priority', 'medium')
        category_id = request.data.get('category_id')
        custom_fields = request.data.get('custom_fields', {})

        if not email:
            return Response({'detail': 'Email address is required.'}, status=400)
        if not subject:
            return Response({'detail': 'Subject is required.'}, status=400)
        if len(subject) < 5:
            return Response({'detail': 'Subject must be at least 5 characters.'}, status=400)

        import re
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
            return Response({'detail': 'Please enter a valid email address.'}, status=400)

        # Get or create guest user
        user, created = User.objects.get_or_create_guest(email, display_name=name)

        # Resolve category
        category = None
        if category_id:
            try:
                category = Category.objects.get(id=category_id, is_active=True)
            except Category.DoesNotExist:
                pass

        valid_priorities = ['low', 'medium', 'high', 'critical']
        if priority not in valid_priorities:
            priority = 'medium'

        ticket = Ticket(
            subject=subject,
            description=description,
            priority=priority,
            category=category,
            requestor=user,
            source=Ticket.PORTAL,
            custom_fields=custom_fields or {},
        )

        # Set SLA if category has it
        if category:
            from django.utils import timezone
            from datetime import timedelta
            ticket.sla_due_at = timezone.now() + timedelta(hours=category.sla_resolution_hours)

        ticket.save()

        # Log to audit
        AuditLog.log(
            user=user,
            action=AuditLog.CREATE,
            module='tickets',
            record_id=str(ticket.pk),
            record_repr=f'{ticket.ticket_number} submitted via guest portal',
            new_value={'email': email, 'guest_created': created},
            ip_address=request.META.get('REMOTE_ADDR'),
        )

        # Trigger email notification
        try:
            from .tasks import send_ticket_notification
            send_ticket_notification.delay(str(ticket.id), 'created')
        except Exception:
            pass

        return Response({
            'ticket_number': ticket.ticket_number,
            'subject': ticket.subject,
            'status': ticket.status,
            'message': (
                f'Your ticket {ticket.ticket_number} has been submitted. '
                f'You will receive updates at {email}.'
            ),
        }, status=status.HTTP_201_CREATED)


class PortalTicketStatusView(APIView):
    """
    GET /api/portal/status/{ticket_number}/?email=user@example.com
    Lets guests check their ticket status without logging in.
    Validates that the ticket belongs to the given email.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, ticket_number):
        email = (request.query_params.get('email') or '').strip().lower()
        if not email:
            return Response({'detail': 'Email address is required.'}, status=400)

        try:
            ticket = Ticket.all_records.select_related(
                'category', 'requestor', 'assignee'
            ).get(ticket_number=ticket_number.upper(), requestor__email=email)
        except Ticket.DoesNotExist:
            return Response(
                {'detail': 'No ticket found with this number and email combination.'},
                status=404,
            )

        return Response({
            'ticket_number': ticket.ticket_number,
            'subject': ticket.subject,
            'status': ticket.status,
            'priority': ticket.priority,
            'category': ticket.category.name if ticket.category else None,
            'created_at': ticket.created_at.isoformat(),
            'updated_at': ticket.updated_at.isoformat(),
            'assignee': ticket.assignee.full_name if ticket.assignee else None,
        })
