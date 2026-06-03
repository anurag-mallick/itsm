import uuid
from datetime import timedelta
from django.db import models, transaction
from django.utils import timezone
from apps.accounts.models import User


class TicketCounter(models.Model):
    """Singleton row (id=1) used for thread-safe sequential ticket numbering."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    current = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'tickets_counter'

    @classmethod
    def next(cls):
        with transaction.atomic():
            counter, _ = cls.objects.select_for_update().get_or_create(id=1)
            counter.current += 1
            counter.save(update_fields=['current'])
            return counter.current


class Category(models.Model):
    name = models.CharField(max_length=100)
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='children',
    )
    sla_response_hours = models.PositiveSmallIntegerField(default=8)
    sla_resolution_hours = models.PositiveSmallIntegerField(default=24)
    default_assignee = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='default_category_assignments',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'tickets_category'
        verbose_name_plural = 'categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class TicketManager(models.Manager):
    """Default manager — excludes archived tickets from all queries."""

    def get_queryset(self):
        return super().get_queryset().filter(is_archived=False)


class ArchivedTicketManager(models.Manager):
    """Returns only archived tickets."""

    def get_queryset(self):
        return super().get_queryset().filter(is_archived=True)


class Ticket(models.Model):
    # Status constants
    OPEN = 'open'
    IN_PROGRESS = 'in_progress'
    PENDING_INFO = 'pending_info'
    RESOLVED = 'resolved'
    CLOSED = 'closed'

    STATUS_CHOICES = [
        (OPEN, 'Open'),
        (IN_PROGRESS, 'In Progress'),
        (PENDING_INFO, 'Pending Info'),
        (RESOLVED, 'Resolved'),
        (CLOSED, 'Closed'),
    ]

    # State machine aliases — used by transition_to() and VALID_TRANSITIONS
    STATUS_OPEN        = OPEN
    STATUS_IN_PROGRESS = IN_PROGRESS
    STATUS_PENDING     = PENDING_INFO   # "pending_info" is the stored value
    STATUS_RESOLVED    = RESOLVED
    STATUS_CLOSED      = CLOSED

    # ── State machine ──────────────────────────────────────────────────────────
    # Legal state transitions — (from_status → [allowed to_statuses])
    VALID_TRANSITIONS: dict = {
        OPEN:         [IN_PROGRESS, PENDING_INFO, CLOSED],
        IN_PROGRESS:  [OPEN, PENDING_INFO, RESOLVED, CLOSED],
        PENDING_INFO: [OPEN, IN_PROGRESS],
        RESOLVED:     [CLOSED, OPEN],
        CLOSED:       [],  # terminal — use archive for hiding
    }

    # Fields that MUST be non-empty when transitioning TO this status
    TRANSITION_REQUIREMENTS: dict = {
        RESOLVED: ['resolution_notes'],
        CLOSED:   ['resolution_notes'],
    }

    # Priority constants
    LOW = 'low'
    MEDIUM = 'medium'
    HIGH = 'high'
    CRITICAL = 'critical'

    PRIORITY_CHOICES = [
        (LOW, 'Low'),
        (MEDIUM, 'Medium'),
        (HIGH, 'High'),
        (CRITICAL, 'Critical'),
    ]

    # Source constants
    PORTAL = 'portal'
    EMAIL = 'email'
    TEAMS = 'teams'

    SOURCE_CHOICES = [
        (PORTAL, 'Portal'),
        (EMAIL, 'Email'),
        (TEAMS, 'Teams'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket_number = models.CharField(max_length=20, unique=True, blank=True, db_index=True)
    subject = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=OPEN, db_index=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default=MEDIUM, db_index=True)
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default=PORTAL)
    category = models.ForeignKey(
        Category,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='tickets',
    )
    requestor = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='requested_tickets',
    )
    assignee = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_tickets',
    )
    custom_fields = models.JSONField(default=dict, blank=True)
    sla_due_at = models.DateTimeField(null=True, blank=True)
    sla_breached = models.BooleanField(default=False)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)
    sla_paused_at = models.DateTimeField(null=True, blank=True)
    sla_paused_seconds = models.PositiveIntegerField(default=0)
    # Used for email threading (In-Reply-To / References headers)
    email_message_id = models.CharField(max_length=255, blank=True)
    teams_conversation_id = models.CharField(max_length=255, blank=True)
    is_archived = models.BooleanField(default=False, db_index=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        'accounts.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='archived_tickets'
    )
    archive_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Custom managers
    objects = TicketManager()          # default: excludes archived
    archived = ArchivedTicketManager() # archived records only
    all_records = models.Manager()     # unfiltered — for admin and archive/unarchive endpoints

    class Meta:
        db_table = 'tickets_ticket'
        ordering = ['-created_at']

    def __str__(self):
        return self.ticket_number

    # ── State machine method ───────────────────────────────────────────────────

    def transition_to(self, new_status: str, resolution_notes: str = '', actor=None) -> None:
        """
        Validate and execute a status transition.
        Raises ValueError on illegal transitions or missing required fields.
        Handles SLA pause/resume automatically.
        """
        allowed = self.VALID_TRANSITIONS.get(self.status, [])
        if new_status not in allowed:
            raise ValueError(
                f'Cannot transition from "{self.status}" to "{new_status}". '
                f'Allowed: {allowed or ["none — this is a terminal state"]}.'
            )

        # Check required fields
        for field in self.TRANSITION_REQUIREMENTS.get(new_status, []):
            value = resolution_notes if field == 'resolution_notes' else getattr(self, field, '')
            if not value or not str(value).strip():
                raise ValueError(
                    f'"{field}" is required when setting status to "{new_status}".'
                )

        now = timezone.now()

        # ── SLA pause / resume ─────────────────────────────────────────────────
        if new_status == self.STATUS_PENDING and self.sla_paused_at is None:
            # Entering pending → pause the SLA clock
            self.sla_paused_at = now

        elif self.sla_paused_at is not None and new_status != self.STATUS_PENDING:
            # Leaving pending → add paused duration to sla_due_at
            paused = (now - self.sla_paused_at).total_seconds()
            self.sla_paused_seconds += int(paused)
            if self.sla_due_at:
                self.sla_due_at = self.sla_due_at + timedelta(seconds=int(paused))
            self.sla_paused_at = None

        # ── Apply transition ───────────────────────────────────────────────────
        old_status = self.status
        self.status = new_status

        if resolution_notes:
            self.resolution_notes = resolution_notes

        if new_status == self.STATUS_RESOLVED:
            self.resolved_at = now
        elif new_status == self.STATUS_CLOSED:
            self.closed_at = now
        elif new_status in (self.STATUS_OPEN, self.STATUS_IN_PROGRESS) and \
                old_status in (self.STATUS_RESOLVED, self.STATUS_CLOSED):
            # Reopening: clear resolved/closed timestamps
            self.resolved_at = None
            self.closed_at = None
            self.sla_breached = False

        self.save(update_fields=[
            'status', 'resolution_notes', 'sla_paused_at', 'sla_paused_seconds',
            'sla_due_at', 'resolved_at', 'closed_at', 'sla_breached',
        ])

    # ── Base save ─────────────────────────────────────────────────────────────

    def save(self, *args, **kwargs):
        if not self.ticket_number:
            seq = TicketCounter.next()
            self.ticket_number = f'TKT-{seq:05d}'

        # Auto-calculate SLA due date from category on first save
        if not self.sla_due_at and self.category_id:
            try:
                from apps.tickets.models import Category as _Category
                cat = _Category.objects.get(id=self.category_id)
                self.sla_due_at = timezone.now() + timedelta(hours=cat.sla_resolution_hours)
            except Exception:
                pass

        # Auto-set timestamps based on status transitions (fallback for direct .save() calls)
        now = timezone.now()
        if self.status == self.RESOLVED and not self.resolved_at:
            self.resolved_at = now
        if self.status == self.CLOSED and not self.closed_at:
            self.closed_at = now

        super().save(*args, **kwargs)


class Comment(models.Model):
    REPLY = 'reply'
    NOTE = 'note'

    COMMENT_TYPE_CHOICES = [
        (REPLY, 'Reply'),
        (NOTE, 'Internal Note'),
    ]

    SOURCE_CHOICES = [
        (Ticket.PORTAL, 'Portal'),
        (Ticket.EMAIL, 'Email'),
        (Ticket.TEAMS, 'Teams'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.PROTECT, related_name='ticket_comments')
    body = models.TextField()
    comment_type = models.CharField(max_length=10, choices=COMMENT_TYPE_CHOICES, default=REPLY)
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default=Ticket.PORTAL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tickets_comment'
        ordering = ['created_at']

    def __str__(self):
        return f'Comment on {self.ticket.ticket_number}'


class Attachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey(
        Ticket,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='attachments',
    )
    comment = models.ForeignKey(
        Comment,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='attachments',
    )
    file = models.FileField(upload_to='attachments/%Y/%m/')
    original_filename = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()
    uploaded_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='uploaded_attachments')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tickets_attachment'
        ordering = ['created_at']

    def __str__(self):
        return self.original_filename


class CannedResponse(models.Model):
    GLOBAL = 'global'
    PERSONAL = 'personal'

    SCOPE_CHOICES = [
        (GLOBAL, 'Global'),
        (PERSONAL, 'Personal'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    body = models.TextField(
        help_text='Supports placeholders: {{requestor_name}} {{ticket_id}} {{agent_name}} {{category}}'
    )
    subject = models.CharField(max_length=255, blank=True)
    category = models.ForeignKey(
        Category,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='canned_responses',
    )
    scope = models.CharField(max_length=10, choices=SCOPE_CHOICES, default=GLOBAL)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='canned_responses')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tickets_canned_response'
        ordering = ['name']

    def __str__(self):
        return self.name

    def render(self, context_dict):
        """Replace {{key}} placeholders with values from context_dict."""
        result = self.body
        for key, value in context_dict.items():
            result = result.replace('{{' + key + '}}', str(value) if value is not None else '')
        return result
