import uuid

from django.db import models, transaction
from django.utils import timezone

from apps.accounts.models import User


class ChangeCounter(models.Model):
    """Singleton row (id=1) used for thread-safe sequential CR numbering."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    current = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'changes_counter'

    @classmethod
    def next(cls):
        with transaction.atomic():
            counter, _ = cls.objects.select_for_update().get_or_create(id=1)
            counter.current += 1
            counter.save(update_fields=['current'])
            return counter.current


class Sprint(models.Model):
    PLANNING = 'planning'
    ACTIVE = 'active'
    COMPLETED = 'completed'

    STATUS_CHOICES = [
        (PLANNING, 'Planning'),
        (ACTIVE, 'Active'),
        (COMPLETED, 'Completed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    goal = models.TextField(blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default=PLANNING, db_index=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        'accounts.User', on_delete=models.PROTECT, related_name='created_sprints'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'changes_sprint'
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    @property
    def days_remaining(self):
        if self.end_date and self.status == self.ACTIVE:
            delta = self.end_date - timezone.now().date()
            return delta.days
        return None

    @property
    def progress(self):
        """Returns (done_count, total_count)."""
        total = self.changes.count()
        done = self.changes.filter(status='done').count()
        return done, total


class ChangeManager(models.Manager):
    """Default manager — excludes archived change requests."""

    def get_queryset(self):
        return super().get_queryset().filter(is_archived=False)


class ArchivedChangeManager(models.Manager):
    """Returns only archived change requests."""

    def get_queryset(self):
        return super().get_queryset().filter(is_archived=True)


class ChangeRequest(models.Model):
    # Change type constants
    TASK = 'task'
    STORY = 'story'
    BUG = 'bug'
    FEATURE = 'feature'
    IMPROVEMENT = 'improvement'
    EPIC = 'epic'

    CHANGE_TYPE_CHOICES = [
        (TASK, 'Task'),
        (STORY, 'Story'),
        (BUG, 'Bug'),
        (FEATURE, 'Feature'),
        (IMPROVEMENT, 'Improvement'),
        (EPIC, 'Epic'),
    ]

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

    # Status constants
    BACKLOG = 'backlog'
    TODO = 'todo'
    IN_PROGRESS = 'in_progress'
    IN_REVIEW = 'in_review'
    DONE = 'done'
    CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (BACKLOG, 'Backlog'),
        (TODO, 'To Do'),
        (IN_PROGRESS, 'In Progress'),
        (IN_REVIEW, 'In Review'),
        (DONE, 'Done'),
        (CANCELLED, 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ref_number = models.CharField(max_length=20, unique=True, blank=True, db_index=True)
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    change_type = models.CharField(
        max_length=15, choices=CHANGE_TYPE_CHOICES, default=TASK, db_index=True
    )
    priority = models.CharField(
        max_length=10, choices=PRIORITY_CHOICES, default=MEDIUM, db_index=True
    )
    status = models.CharField(
        max_length=15, choices=STATUS_CHOICES, default=BACKLOG, db_index=True
    )
    reporter = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name='reported_changes'
    )
    assignee = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_changes',
    )
    due_date = models.DateField(null=True, blank=True)
    estimated_hours = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True
    )
    actual_hours = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True
    )
    story_points = models.PositiveSmallIntegerField(null=True, blank=True)
    labels = models.CharField(max_length=500, blank=True, help_text='Comma-separated tags')
    custom_fields = models.JSONField(default=dict, blank=True)
    linked_ticket_ids = models.JSONField(
        default=list, blank=True, help_text='List of ticket UUID strings (soft link)'
    )
    sprint = models.ForeignKey(
        'Sprint', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='changes'
    )
    is_archived = models.BooleanField(default=False, db_index=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='archived_changes',
    )
    archive_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Custom managers
    objects = ChangeManager()           # default: excludes archived
    archived = ArchivedChangeManager()  # archived records only
    all_records = models.Manager()      # unfiltered — for admin and archive/unarchive endpoints

    class Meta:
        db_table = 'changes_changerequest'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.ref_number} — {self.title}'

    def save(self, *args, **kwargs):
        if not self.ref_number:
            seq = ChangeCounter.next()
            self.ref_number = f'CR-{seq:05d}'
        super().save(*args, **kwargs)


class ChangeComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    change = models.ForeignKey(
        ChangeRequest, on_delete=models.CASCADE, related_name='comments'
    )
    author = models.ForeignKey(User, on_delete=models.PROTECT, related_name='change_comments')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'changes_comment'
        ordering = ['created_at']

    def __str__(self):
        return f'Comment on {self.change.ref_number}'
