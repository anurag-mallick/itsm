import json
import logging

from botbuilder.core import MessageFactory, TurnContext
from botbuilder.core.teams import TeamsActivityHandler
from botbuilder.schema import Activity

logger = logging.getLogger(__name__)


class ITSMBot(TeamsActivityHandler):
    """Microsoft Teams bot for ITSM ticket creation and management."""

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def on_members_added_activity(self, members_added, turn_context: TurnContext):
        """Send a welcome card when the bot is installed / added to a chat."""
        for member in members_added:
            if member.id != turn_context.activity.recipient.id:
                await turn_context.send_activity(
                    MessageFactory.text(
                        'Hello! I am the IT Help Desk bot for Bluspring Enterprises. '
                        'Type **new ticket** or **help** to get started.'
                    )
                )

    # ------------------------------------------------------------------
    # Message handler
    # ------------------------------------------------------------------

    async def on_message_activity(self, turn_context: TurnContext):
        """Handle incoming messages: card submissions or plain-text commands."""
        activity = turn_context.activity

        # Card submission — value is populated by Adaptive Card Action.Submit
        if activity.value:
            try:
                data = activity.value if isinstance(activity.value, dict) else json.loads(activity.value)
                action = data.get('action', '')
                if action == 'create_ticket':
                    await self._handle_card_submit(turn_context, data)
                    return
            except (TypeError, ValueError, json.JSONDecodeError) as exc:
                logger.warning('ITSMBot.on_message_activity: failed to parse card value: %s', exc)

        # Plain-text commands
        text = (activity.text or '').strip().lower()

        if text in ('new ticket', 'create ticket', 'ticket', 'help', 'start', ''):
            categories = await self._get_categories()
            card = self._create_ticket_card(categories)
            response = Activity(
                type='message',
                attachments=[
                    {
                        'contentType': 'application/vnd.microsoft.card.adaptive',
                        'content': card,
                    }
                ],
            )
            await turn_context.send_activity(response)
        else:
            await turn_context.send_activity(
                MessageFactory.text(
                    'Type **new ticket** to raise a support request, '
                    'or reply to an existing ticket thread.'
                )
            )

    # ------------------------------------------------------------------
    # Adaptive Card builder
    # ------------------------------------------------------------------

    def _create_ticket_card(self, categories):
        """Return an Adaptive Card JSON dict for ticket creation."""
        category_choices = [
            {'title': name, 'value': name} for name in categories
        ] if categories else [{'title': 'General', 'value': 'General'}]

        return {
            '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
            'type': 'AdaptiveCard',
            'version': '1.4',
            'body': [
                {
                    'type': 'TextBlock',
                    'text': 'Raise a Support Ticket',
                    'weight': 'Bolder',
                    'size': 'Large',
                    'wrap': True,
                },
                {
                    'type': 'TextBlock',
                    'text': 'Summary',
                    'weight': 'Bolder',
                    'spacing': 'Medium',
                },
                {
                    'type': 'Input.Text',
                    'id': 'summary',
                    'placeholder': 'Brief description of the issue',
                    'isRequired': True,
                    'errorMessage': 'Please enter a summary.',
                    'maxLength': 255,
                },
                {
                    'type': 'TextBlock',
                    'text': 'Category',
                    'weight': 'Bolder',
                    'spacing': 'Medium',
                },
                {
                    'type': 'Input.ChoiceSet',
                    'id': 'category',
                    'style': 'compact',
                    'isRequired': False,
                    'choices': category_choices,
                    'placeholder': 'Select a category',
                },
                {
                    'type': 'TextBlock',
                    'text': 'Priority',
                    'weight': 'Bolder',
                    'spacing': 'Medium',
                },
                {
                    'type': 'Input.ChoiceSet',
                    'id': 'priority',
                    'style': 'compact',
                    'value': 'medium',
                    'choices': [
                        {'title': 'Low', 'value': 'low'},
                        {'title': 'Medium', 'value': 'medium'},
                        {'title': 'High', 'value': 'high'},
                        {'title': 'Critical', 'value': 'critical'},
                    ],
                },
                {
                    'type': 'TextBlock',
                    'text': 'Description',
                    'weight': 'Bolder',
                    'spacing': 'Medium',
                },
                {
                    'type': 'Input.Text',
                    'id': 'description',
                    'placeholder': 'Provide additional details about the issue...',
                    'isMultiline': True,
                    'maxLength': 4000,
                },
            ],
            'actions': [
                {
                    'type': 'Action.Submit',
                    'title': 'Submit Ticket',
                    'data': {'action': 'create_ticket'},
                    'style': 'positive',
                }
            ],
        }

    # ------------------------------------------------------------------
    # Card submission handler
    # ------------------------------------------------------------------

    async def _handle_card_submit(self, turn_context: TurnContext, data: dict):
        """
        Process an Adaptive Card ticket-creation submission.

        Steps:
          1. Resolve or create the Teams user as a Django guest account.
          2. Store the conversation reference on the user record.
          3. Resolve the Category from the submitted name.
          4. Create the Ticket via Django ORM.
          5. Dispatch send_ticket_notification.
          6. Reply with a confirmation card.
        """
        from django.conf import settings

        from apps.accounts.models import User
        from apps.tickets.models import Category, Ticket
        from apps.tickets.tasks import send_ticket_notification

        activity = turn_context.activity
        teams_user = activity.from_property

        # ---- Derive user identity ----
        # teams_user.id is the Teams AAD object id — use it as a stable identifier.
        # We fabricate an email if none is available (Teams personal chat does not
        # always supply one; the email is stored only on the User record).
        teams_id = teams_user.id or ''
        display_name = teams_user.name or 'Teams User'

        # Attempt to find an existing user by teams id stored in teams_conversation_ref
        user = None
        if teams_id:
            user = User.objects.filter(
                teams_conversation_ref__teams_id=teams_id
            ).first()

        if user is None:
            # Derive a pseudo-email from the Teams id so get_or_create_guest is stable
            fake_email = f'teams-{teams_id}@teams.local' if teams_id else f'{display_name.replace(" ", ".").lower()}@teams.local'
            user, _ = User.objects.get_or_create_guest(fake_email, display_name)

        # ---- Persist conversation reference ----
        conversation = activity.conversation
        conversation_ref = {
            'teams_id': teams_id,
            'conversation_id': conversation.id if conversation else '',
            'service_url': activity.service_url or '',
            'channel_id': activity.channel_id or '',
        }
        user.teams_conversation_ref = conversation_ref
        user.save(update_fields=['teams_conversation_ref'])

        # ---- Resolve category ----
        category_name = (data.get('category') or '').strip()
        category = None
        if category_name:
            try:
                category = Category.objects.get(name=category_name, is_active=True)
            except Category.DoesNotExist:
                logger.warning(
                    'ITSMBot._handle_card_submit: category "%s" not found', category_name
                )
                category = Category.objects.filter(is_active=True).first()
        else:
            category = Category.objects.filter(is_active=True).first()

        # ---- Priority validation ----
        valid_priorities = {Ticket.LOW, Ticket.MEDIUM, Ticket.HIGH, Ticket.CRITICAL}
        priority = (data.get('priority') or Ticket.MEDIUM).lower()
        if priority not in valid_priorities:
            priority = Ticket.MEDIUM

        # ---- Subject / description ----
        subject = (data.get('summary') or '').strip()
        description = (data.get('description') or '').strip()

        if not subject:
            await turn_context.send_activity(
                MessageFactory.text('Please provide a summary for your ticket.')
            )
            return

        # ---- Derive conversation id for the ticket ----
        conversation_id = conversation.id if conversation else ''

        # ---- Create ticket ----
        try:
            assignee = category.default_assignee if category else None
            ticket = Ticket.objects.create(
                subject=subject,
                description=description,
                source=Ticket.TEAMS,
                requestor=user,
                category=category,
                assignee=assignee,
                priority=priority,
                teams_conversation_id=conversation_id,
            )
        except Exception as exc:
            logger.error(
                'ITSMBot._handle_card_submit: failed to create ticket: %s', exc, exc_info=True
            )
            await turn_context.send_activity(
                MessageFactory.text(
                    'Sorry, there was a problem creating your ticket. Please try again or contact IT directly.'
                )
            )
            return

        logger.info(
            'ITSMBot._handle_card_submit: created ticket %s for user %s',
            ticket.ticket_number,
            user.email,
        )

        # ---- Dispatch notification ----
        try:
            send_ticket_notification.delay(str(ticket.id), 'created')
        except Exception as exc:
            logger.warning(
                'ITSMBot._handle_card_submit: could not dispatch notification for ticket %s: %s',
                ticket.ticket_number, exc,
            )

        # ---- Send confirmation card ----
        frontend_url = getattr(settings, 'FRONTEND_URL', 'https://helpdesk.yourdomain.local')
        ticket_url = f'{frontend_url}/tickets/{ticket.id}'
        category_display = ticket.category.name if ticket.category else 'Uncategorised'
        assignee_display = ticket.assignee.full_name if ticket.assignee else 'Unassigned'

        confirmation_card = {
            '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
            'type': 'AdaptiveCard',
            'version': '1.4',
            'body': [
                {
                    'type': 'TextBlock',
                    'text': 'Ticket Created Successfully',
                    'weight': 'Bolder',
                    'size': 'Large',
                    'color': 'Good',
                    'wrap': True,
                },
                {
                    'type': 'FactSet',
                    'facts': [
                        {'title': 'Ticket #', 'value': ticket.ticket_number},
                        {'title': 'Subject', 'value': ticket.subject},
                        {'title': 'Priority', 'value': ticket.get_priority_display()},
                        {'title': 'Category', 'value': category_display},
                        {'title': 'Assigned to', 'value': assignee_display},
                        {'title': 'Status', 'value': ticket.get_status_display()},
                    ],
                },
                {
                    'type': 'TextBlock',
                    'text': (
                        'Our team will review your request shortly. '
                        'You will receive email updates as the ticket progresses.'
                    ),
                    'wrap': True,
                    'spacing': 'Medium',
                    'isSubtle': True,
                },
            ],
            'actions': [
                {
                    'type': 'Action.OpenUrl',
                    'title': 'View Ticket',
                    'url': ticket_url,
                }
            ],
        }

        response = Activity(
            type='message',
            attachments=[
                {
                    'contentType': 'application/vnd.microsoft.card.adaptive',
                    'content': confirmation_card,
                }
            ],
        )
        await turn_context.send_activity(response)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def _get_categories():
        """Return a list of active category names for the card dropdown."""
        try:
            from apps.tickets.models import Category
            return list(
                Category.objects.filter(is_active=True).order_by('name').values_list('name', flat=True)
            )
        except Exception as exc:
            logger.warning('ITSMBot._get_categories: %s', exc)
            return []
