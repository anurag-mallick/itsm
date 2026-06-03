"""
Workflow rule engine.
Called after ticket create/update to evaluate matching rules and execute actions.
"""
import logging
from django.utils import timezone

logger = logging.getLogger('itsm.workflows')


# ── Condition evaluation ──────────────────────────────────────────────────────

def get_ticket_field_value(ticket, field: str):
    """Extract a field value from the ticket for comparison."""
    field_map = {
        'priority':        lambda t: t.priority,
        'status':          lambda t: t.status,
        'source':          lambda t: t.source,
        'category_id':     lambda t: str(t.category_id) if t.category_id else '',
        'category_name':   lambda t: t.category.name if t.category else '',
        'requestor_email': lambda t: t.requestor.email if t.requestor else '',
        'assignee_id':     lambda t: str(t.assignee_id) if t.assignee_id else '',
        'subject':         lambda t: t.subject,
        'description':     lambda t: t.description,
    }
    fn = field_map.get(field)
    if fn:
        try:
            return fn(ticket)
        except Exception:
            return ''
    # Check custom_fields
    if field.startswith('custom.'):
        key = field[7:]
        return str(ticket.custom_fields.get(key, ''))
    return ''


def evaluate_condition(ticket, condition: dict) -> bool:
    field    = condition.get('field', '')
    operator = condition.get('operator', 'equals')
    value    = condition.get('value', '')

    actual = get_ticket_field_value(ticket, field)

    if operator == 'equals':
        return str(actual).lower() == str(value).lower()
    elif operator == 'not_equals':
        return str(actual).lower() != str(value).lower()
    elif operator == 'contains':
        return str(value).lower() in str(actual).lower()
    elif operator == 'not_contains':
        return str(value).lower() not in str(actual).lower()
    elif operator == 'starts_with':
        return str(actual).lower().startswith(str(value).lower())
    elif operator == 'in':
        vals = value if isinstance(value, list) else [value]
        return str(actual).lower() in [str(v).lower() for v in vals]
    elif operator == 'not_in':
        vals = value if isinstance(value, list) else [value]
        return str(actual).lower() not in [str(v).lower() for v in vals]
    elif operator == 'is_empty':
        return not actual
    elif operator == 'is_not_empty':
        return bool(actual)
    return False


def evaluate_rule(ticket, rule) -> bool:
    """Return True if the ticket matches the rule's conditions."""
    if not rule.conditions:
        return True  # No conditions = always matches
    results = [evaluate_condition(ticket, c) for c in rule.conditions]
    if rule.condition_match == 'any':
        return any(results)
    return all(results)  # default: 'all'


# ── Action execution ──────────────────────────────────────────────────────────

def execute_action(ticket, action: dict, triggered_by_rule):
    action_type = action.get('type', '')
    value = action.get('value', '')

    if action_type == 'assign_to':
        try:
            from apps.accounts.models import User
            user = User.objects.get(id=value, is_active=True)
            ticket.assignee = user
            ticket.save(update_fields=['assignee'])
            logger.info(
                f'[Workflow] {triggered_by_rule.name}: assigned {ticket.ticket_number} to {user.email}'
            )
        except Exception as e:
            logger.warning(f'[Workflow] assign_to failed: {e}')

    elif action_type == 'set_priority':
        if value in ('low', 'medium', 'high', 'critical'):
            ticket.priority = value
            ticket.save(update_fields=['priority'])

    elif action_type == 'set_category':
        try:
            from apps.tickets.models import Category
            cat = Category.objects.get(id=int(value))
            ticket.category = cat
            ticket.save(update_fields=['category'])
        except Exception as e:
            logger.warning(f'[Workflow] set_category failed: {e}')

    elif action_type == 'set_status':
        valid = ['open', 'in_progress', 'pending_info', 'resolved', 'closed']
        if value in valid:
            try:
                ticket.transition_to(value)
            except Exception as e:
                logger.warning(f'[Workflow] set_status failed: {e}')

    elif action_type == 'add_note':
        try:
            from apps.tickets.models import Comment
            author = triggered_by_rule.created_by
            if author is None:
                logger.warning(
                    f'[Workflow] add_note skipped for rule "{triggered_by_rule.name}": '
                    f'no created_by user available (Comment.author is non-nullable).'
                )
                return
            Comment.objects.create(
                ticket=ticket,
                author=author,
                body=value or f'Auto-processed by workflow: {triggered_by_rule.name}',
                comment_type=Comment.NOTE,
                source='portal',
            )
        except Exception as e:
            logger.warning(f'[Workflow] add_note failed: {e}')

    elif action_type == 'send_notification':
        try:
            from apps.accounts.models import User
            from apps.notifications.models import Notification
            user = User.objects.get(id=value, is_active=True)
            Notification.create(
                user=user,
                notification_type='ticket_assigned',
                title=f'Ticket {ticket.ticket_number} matches workflow: {triggered_by_rule.name}',
                body=ticket.subject[:100],
                url=f'/tickets/{ticket.id}',
            )
        except Exception as e:
            logger.warning(f'[Workflow] send_notification failed: {e}')


# ── Main entry point ──────────────────────────────────────────────────────────

def run_workflows(ticket, trigger: str):
    """Evaluate all active rules for the given trigger and execute matching ones."""
    from .models import WorkflowRule
    rules = WorkflowRule.objects.filter(
        is_active=True, trigger=trigger
    ).order_by('run_order', 'created_at')
    matched = 0
    for rule in rules:
        try:
            if evaluate_rule(ticket, rule):
                logger.info(f'[Workflow] Rule "{rule.name}" matched {ticket.ticket_number}')
                for action in rule.actions:
                    execute_action(ticket, action, rule)
                rule.times_triggered += 1
                rule.last_triggered_at = timezone.now()
                rule.save(update_fields=['times_triggered', 'last_triggered_at'])
                matched += 1
        except Exception as e:
            logger.error(f'[Workflow] Rule "{rule.name}" error: {e}')
    return matched
