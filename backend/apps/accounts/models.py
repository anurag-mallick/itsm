import uuid
from datetime import timedelta
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.mail import send_mail
from django.conf import settings
from django.db import models
from django.utils import timezone


class Role(models.Model):
    SUPER_ADMIN = 'super_admin'
    IT_MANAGER = 'it_manager'
    IT_AGENT = 'it_agent'
    REQUESTOR = 'requestor'
    AUDITOR = 'auditor'

    ROLE_CHOICES = [
        (SUPER_ADMIN, 'Super Admin'),
        (IT_MANAGER, 'IT Manager'),
        (IT_AGENT, 'IT Agent'),
        (REQUESTOR, 'Requestor'),
        (AUDITOR, 'Auditor'),
    ]

    name = models.CharField(max_length=20, choices=ROLE_CHOICES, unique=True)
    # Per-role permission overrides (reserved for Phase 2 fine-grained control)
    permissions = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'accounts_role'

    def __str__(self):
        return self.get_name_display()


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError('Email is required')
        user = self.model(email=self.normalize_email(email), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra)

    def get_or_create_guest(self, email, display_name=''):
        """Auto-create a guest account from an inbound email sender."""
        user, created = self.get_or_create(
            email=self.normalize_email(email),
            defaults={
                'first_name': display_name.split()[0] if display_name else '',
                'last_name': ' '.join(display_name.split()[1:]) if display_name else '',
                'account_type': User.GUEST,
                'is_active': True,
            },
        )
        if created:
            user.set_unusable_password()
            # Assign the default Requestor role
            try:
                user.role = Role.objects.get(name=Role.REQUESTOR)
                user.save(update_fields=['role'])
            except Role.DoesNotExist:
                pass
        return user, created


class User(AbstractBaseUser, PermissionsMixin):
    STAFF = 'staff'
    GUEST = 'guest'

    ACCOUNT_TYPE_CHOICES = [
        (STAFF, 'Staff'),
        (GUEST, 'Guest'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    role = models.ForeignKey(Role, on_delete=models.PROTECT, null=True, blank=True, related_name='users')
    account_type = models.CharField(max_length=10, choices=ACCOUNT_TYPE_CHOICES, default=STAFF)
    # Teams conversation reference — stored when user first messages the bot
    teams_conversation_ref = models.JSONField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        db_table = 'accounts_user'

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        name = f'{self.first_name} {self.last_name}'.strip()
        return name if name else self.email

    @property
    def role_name(self):
        return self.role.name if self.role else None


class PasswordResetToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='password_reset_tokens',
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'accounts_password_reset_token'

    def is_valid(self):
        return self.used_at is None and timezone.now() < self.expires_at

    @classmethod
    def create_for_user(cls, user):
        # Invalidate existing unused tokens for this user
        cls.objects.filter(user=user, used_at__isnull=True).update(used_at=timezone.now())
        return cls.objects.create(
            user=user,
            expires_at=timezone.now() + timedelta(hours=1),
        )

    def send_reset_email(self):
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000').rstrip('/')
        reset_url = f'{frontend_url}/reset-password?token={self.token}'
        send_mail(
            subject='Reset your ITSM password',
            message=f"""You requested a password reset.

Click the link below to set a new password (valid for 1 hour):
{reset_url}

If you did not request this, ignore this email.

IT Service Desk""",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[self.user.email],
            fail_silently=True,
        )
