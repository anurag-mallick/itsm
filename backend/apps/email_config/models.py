import uuid
from django.db import models


class InboundMailbox(models.Model):
    IMAP = 'imap'
    POP3 = 'pop3'
    PROTOCOL_CHOICES = [(IMAP, 'IMAP'), (POP3, 'POP3')]

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name             = models.CharField(max_length=200)           # "IT Helpdesk", "HR Support", etc.
    email_address    = models.EmailField(unique=True)             # helpdesk@company.local
    protocol         = models.CharField(max_length=4, choices=PROTOCOL_CHOICES, default=IMAP)
    host             = models.CharField(max_length=255)           # iRedMail server IP
    port             = models.PositiveIntegerField(default=993)   # 993=IMAP SSL, 995=POP3 SSL
    username         = models.CharField(max_length=255)           # usually same as email_address
    password         = models.TextField()                         # store as-is (TLS in transit)
    use_ssl          = models.BooleanField(default=True)
    imap_folder      = models.CharField(max_length=200, default='INBOX')
    processed_folder = models.CharField(
        max_length=200,
        default='INBOX.Processed',
        help_text='IMAP folder to move processed emails into. Ignored for POP3.',
    )
    # Per-mailbox ticket defaults
    default_category = models.ForeignKey(
        'tickets.Category',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='inbound_mailboxes',
        help_text='Tickets created from this mailbox get this category by default.',
    )
    default_priority = models.CharField(
        max_length=10,
        choices=[
            ('low', 'Low'),
            ('medium', 'Medium'),
            ('high', 'High'),
            ('critical', 'Critical'),
        ],
        default='medium',
    )
    is_active             = models.BooleanField(default=True, db_index=True)
    poll_interval_seconds = models.PositiveIntegerField(default=60)
    # Status tracking
    last_polled_at    = models.DateTimeField(null=True, blank=True)
    last_error        = models.TextField(blank=True)
    emails_processed  = models.PositiveIntegerField(default=0)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'email_config_inbound_mailbox'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} <{self.email_address}> ({self.get_protocol_display()})'

    def connection_string(self):
        proto = (
            f'{"imaps" if self.use_ssl else "imap"}'
            if self.protocol == self.IMAP
            else f'{"pop3s" if self.use_ssl else "pop3"}'
        )
        return f'{proto}://{self.username}@{self.host}:{self.port}'
