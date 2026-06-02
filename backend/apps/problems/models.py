import uuid

from django.db import models, transaction
from django.utils import timezone


class ProblemCounter(models.Model):
    """Singleton row (id=1) used for thread-safe sequential PRB numbering."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    current = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'problem_counter'

    @classmethod
    def next(cls):
        with transaction.atomic():
            counter, _ = cls.objects.select_for_update().get_or_create(id=1)
            counter.current += 1
            counter.save(update_fields=['current'])
            return counter.current


class ProblemRecord(models.Model):
    STATUS_OPEN = 'open'
    STATUS_INVESTIGATING = 'investigating'
    STATUS_KNOWN_ERROR = 'known_error'
    STATUS_RESOLVED = 'resolved'

    STATUS_CHOICES = [
        (STATUS_OPEN,          'Open'),
        (STATUS_INVESTIGATING, 'Under Investigation'),
        (STATUS_KNOWN_ERROR,   'Known Error'),
        (STATUS_RESOLVED,      'Resolved'),
    ]

    PRIORITY_CHOICES = [
        ('low',      'Low'),
        ('medium',   'Medium'),
        ('high',     'High'),
        ('critical', 'Critical'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ref_number = models.CharField(max_length=20, unique=True, blank=True)  # PRB-00001
    title = models.CharField(max_length=300)
    description = models.TextField()
    root_cause = models.TextField(blank=True)
    workaround = models.TextField(blank=True)
    resolution = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN, db_index=True
    )
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    owner = models.ForeignKey(
        'accounts.User',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='owned_problems',
    )
    linked_tickets = models.ManyToManyField(
        'tickets.Ticket', blank=True, related_name='problems'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'problem_record'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.ref_number}: {self.title}'

    def save(self, *args, **kwargs):
        if not self.ref_number:
            self.ref_number = f'PRB-{ProblemCounter.next():05d}'
        if self.status == self.STATUS_RESOLVED and not self.resolved_at:
            self.resolved_at = timezone.now()
        super().save(*args, **kwargs)
