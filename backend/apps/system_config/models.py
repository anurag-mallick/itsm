from django.db import models


class ConfigSection(models.TextChoices):
    SMTP = 'smtp', 'Email (SMTP)'
    IMAP = 'imap', 'Email Inbound (IMAP)'
    POP3 = 'pop3', 'Email Inbound (POP3)'
    TEAMS = 'teams', 'Microsoft Teams'
    GENERAL = 'general', 'General'


class SystemConfig(models.Model):
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField(blank=True)
    section = models.CharField(max_length=20, choices=ConfigSection.choices)
    label = models.CharField(max_length=200)
    help_text = models.CharField(max_length=500, blank=True)
    is_secret = models.BooleanField(default=False)
    is_required = models.BooleanField(default=False)
    display_order = models.PositiveSmallIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by_email = models.EmailField(blank=True)

    class Meta:
        db_table = 'system_config'
        ordering = ['section', 'display_order']

    def __str__(self):
        return f'{self.section}.{self.key}'

    @classmethod
    def get(cls, key, default=''):
        """Return the value for a config key, or default if not found."""
        try:
            return cls.objects.get(key=key).value
        except cls.DoesNotExist:
            return default

    @classmethod
    def get_section(cls, section):
        """Return a dict of key: value for all records in a section."""
        return {c.key: c.value for c in cls.objects.filter(section=section)}

    @classmethod
    def seed_defaults(cls):
        """
        Create default SystemConfig records if they do not already exist.
        Returns a tuple (created_count, skipped_count).
        """
        defaults = [
            # ---- SMTP ----
            {
                'key': 'smtp_host',
                'section': ConfigSection.SMTP,
                'label': 'SMTP Host',
                'help_text': 'Hostname or IP address of the outgoing mail server.',
                'is_secret': False,
                'is_required': True,
                'display_order': 1,
                'value': '',
            },
            {
                'key': 'smtp_port',
                'section': ConfigSection.SMTP,
                'label': 'SMTP Port',
                'help_text': 'Port number for SMTP (typically 587 for STARTTLS, 465 for SSL).',
                'is_secret': False,
                'is_required': True,
                'display_order': 2,
                'value': '587',
            },
            {
                'key': 'smtp_user',
                'section': ConfigSection.SMTP,
                'label': 'SMTP Username',
                'help_text': 'Username for authenticating with the SMTP server.',
                'is_secret': False,
                'is_required': True,
                'display_order': 3,
                'value': '',
            },
            {
                'key': 'smtp_password',
                'section': ConfigSection.SMTP,
                'label': 'SMTP Password',
                'help_text': 'Password for authenticating with the SMTP server.',
                'is_secret': True,
                'is_required': True,
                'display_order': 4,
                'value': '',
            },
            {
                'key': 'smtp_use_tls',
                'section': ConfigSection.SMTP,
                'label': 'Use TLS',
                'help_text': 'Enable STARTTLS encryption. Set to "true" or "false".',
                'is_secret': False,
                'is_required': False,
                'display_order': 5,
                'value': 'true',
            },
            {
                'key': 'email_from',
                'section': ConfigSection.SMTP,
                'label': 'From Address',
                'help_text': 'The "From" address used for outgoing helpdesk emails.',
                'is_secret': False,
                'is_required': True,
                'display_order': 6,
                'value': '',
            },
            # ---- IMAP ----
            {
                'key': 'imap_host',
                'section': ConfigSection.IMAP,
                'label': 'IMAP Host',
                'help_text': 'Hostname or IP address of the inbound mail server.',
                'is_secret': False,
                'is_required': True,
                'display_order': 1,
                'value': '',
            },
            {
                'key': 'imap_port',
                'section': ConfigSection.IMAP,
                'label': 'IMAP Port',
                'help_text': 'Port number for IMAP (typically 993 for SSL, 143 for plain/STARTTLS).',
                'is_secret': False,
                'is_required': True,
                'display_order': 2,
                'value': '993',
            },
            {
                'key': 'imap_user',
                'section': ConfigSection.IMAP,
                'label': 'IMAP Username',
                'help_text': 'Username for authenticating with the IMAP server.',
                'is_secret': False,
                'is_required': True,
                'display_order': 3,
                'value': '',
            },
            {
                'key': 'imap_password',
                'section': ConfigSection.IMAP,
                'label': 'IMAP Password',
                'help_text': 'Password for authenticating with the IMAP server.',
                'is_secret': True,
                'is_required': True,
                'display_order': 4,
                'value': '',
            },
            {
                'key': 'imap_ssl',
                'section': ConfigSection.IMAP,
                'label': 'Use SSL',
                'help_text': 'Enable SSL for IMAP connection. Set to "true" or "false".',
                'is_secret': False,
                'is_required': False,
                'display_order': 5,
                'value': 'true',
            },
            {
                'key': 'imap_processed_folder',
                'section': ConfigSection.IMAP,
                'label': 'Processed Folder',
                'help_text': 'IMAP folder to move processed emails into.',
                'is_secret': False,
                'is_required': False,
                'display_order': 6,
                'value': 'INBOX.Processed',
            },
            # ---- POP3 ----
            {
                'key': 'pop3_host',
                'section': ConfigSection.POP3,
                'label': 'POP3 Host',
                'help_text': 'Hostname or IP address of the inbound POP3 server.',
                'is_secret': False,
                'is_required': True,
                'display_order': 1,
                'value': '',
            },
            {
                'key': 'pop3_port',
                'section': ConfigSection.POP3,
                'label': 'POP3 Port',
                'help_text': 'Port number for POP3 (typically 995 for SSL, 110 for plain).',
                'is_secret': False,
                'is_required': True,
                'display_order': 2,
                'value': '995',
            },
            {
                'key': 'pop3_user',
                'section': ConfigSection.POP3,
                'label': 'POP3 Username',
                'help_text': 'Username for authenticating with the POP3 server.',
                'is_secret': False,
                'is_required': True,
                'display_order': 3,
                'value': '',
            },
            {
                'key': 'pop3_password',
                'section': ConfigSection.POP3,
                'label': 'POP3 Password',
                'help_text': 'Password for authenticating with the POP3 server.',
                'is_secret': True,
                'is_required': True,
                'display_order': 4,
                'value': '',
            },
            {
                'key': 'pop3_ssl',
                'section': ConfigSection.POP3,
                'label': 'Use SSL',
                'help_text': 'Enable SSL for POP3 connection. Set to "true" or "false".',
                'is_secret': False,
                'is_required': False,
                'display_order': 5,
                'value': 'true',
            },
            # ---- TEAMS ----
            {
                'key': 'teams_app_id',
                'section': ConfigSection.TEAMS,
                'label': 'Teams App ID',
                'help_text': 'Azure Bot Registration Application (Client) ID.',
                'is_secret': False,
                'is_required': True,
                'display_order': 1,
                'value': '',
            },
            {
                'key': 'teams_app_password',
                'section': ConfigSection.TEAMS,
                'label': 'Teams App Password',
                'help_text': 'Azure Bot Registration client secret.',
                'is_secret': True,
                'is_required': True,
                'display_order': 2,
                'value': '',
            },
            {
                'key': 'teams_tenant_id',
                'section': ConfigSection.TEAMS,
                'label': 'Tenant ID',
                'help_text': 'Azure Active Directory Tenant ID.',
                'is_secret': False,
                'is_required': True,
                'display_order': 3,
                'value': '',
            },
            {
                'key': 'teams_webhook_url',
                'section': ConfigSection.TEAMS,
                'label': 'Webhook URL',
                'help_text': (
                    'Public HTTPS URL of this server — used as the Bot Framework messaging endpoint. '
                    'Example: https://helpdesk.yourdomain.local/api/teams/webhook/'
                ),
                'is_secret': False,
                'is_required': True,
                'display_order': 4,
                'value': '',
            },
            # ---- GENERAL ----
            {
                'key': 'frontend_url',
                'section': ConfigSection.GENERAL,
                'label': 'Frontend URL',
                'help_text': 'Base URL of the helpdesk frontend (used in email links).',
                'is_secret': False,
                'is_required': True,
                'display_order': 1,
                'value': 'https://helpdesk.yourdomain.local',
            },
            {
                'key': 'company_name',
                'section': ConfigSection.GENERAL,
                'label': 'Company Name',
                'help_text': 'Displayed in outgoing email footers.',
                'is_secret': False,
                'is_required': False,
                'display_order': 2,
                'value': 'Bluspring Enterprises',
            },
            {
                'key': 'helpdesk_name',
                'section': ConfigSection.GENERAL,
                'label': 'Helpdesk Name',
                'help_text': 'Name of the IT Help Desk shown in emails and the portal.',
                'is_secret': False,
                'is_required': False,
                'display_order': 3,
                'value': 'IT Help Desk',
            },
        ]

        created_count = 0
        skipped_count = 0

        for item in defaults:
            value = item.pop('value', '')
            _, created = cls.objects.get_or_create(
                key=item['key'],
                defaults={**item, 'value': value},
            )
            if created:
                created_count += 1
            else:
                skipped_count += 1

        return created_count, skipped_count
