from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView as BaseTokenRefreshView
from django.contrib.auth import authenticate

from .models import User, Role
from .serializers import (
    UserSerializer, UserCreateSerializer, LoginSerializer,
    RoleSerializer, ChangePasswordSerializer,
)
from .permissions import IsITManager, IsSuperAdmin
from .throttles import LoginRateThrottle
from .lockout import is_locked_out, record_failed_login, clear_failed_logins, get_remaining_attempts
from apps.audit.models import AuditLog


def _log(request, action, module='accounts', record_id='', record_repr='', old=None, new=None):
    AuditLog.objects.create(
        user_email=request.user.email if request.user.is_authenticated else '',
        action=action,
        module=module,
        record_id=record_id,
        record_repr=record_repr,
        old_value=old,
        new_value=new,
        ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        user_agent=request.META.get('HTTP_USER_AGENT', ''),
    )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', ''))
        ip = ip.split(',')[0].strip()

        if is_locked_out(email):
            return Response(
                {
                    'detail': 'Account is temporarily locked due to repeated failed login attempts. '
                              'Please try again in 15 minutes.',
                    'remaining_attempts': 0,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        user = authenticate(
            request,
            username=email,
            password=serializer.validated_data['password'],
        )

        if not user:
            attempts = record_failed_login(email, ip)
            remaining = get_remaining_attempts(email)
            return Response(
                {'detail': 'Invalid credentials.', 'remaining_attempts': remaining},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            return Response({'detail': 'Account is disabled.'}, status=status.HTTP_403_FORBIDDEN)

        clear_failed_logins(email)

        refresh = RefreshToken.for_user(user)
        AuditLog.objects.create(
            user_email=user.email,
            action=AuditLog.LOGIN,
            module='accounts',
            record_id=str(user.id),
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data,
        })


class LogoutView(APIView):
    def post(self, request):
        try:
            RefreshToken(request.data.get('refresh', '')).blacklist()
        except Exception:
            pass
        AuditLog.objects.create(
            user_email=request.user.email,
            action=AuditLog.LOGOUT,
            module='accounts',
            record_id=str(request.user.id),
            ip_address=getattr(request, 'audit_ip', request.META.get('REMOTE_ADDR')),
        )
        return Response({'detail': 'Logged out.'})


class TokenRefreshView(BaseTokenRefreshView):
    pass


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=['password'])
        _log(request, AuditLog.UPDATE, record_id=str(request.user.id), record_repr=request.user.email)
        return Response({'detail': 'Password updated.'})


class UserListCreateView(generics.ListCreateAPIView):
    queryset = User.objects.select_related('role').order_by('-created_at')

    def get_serializer_class(self):
        return UserCreateSerializer if self.request.method == 'POST' else UserSerializer

    def get_permissions(self):
        return [IsITManager()] if self.request.method == 'GET' else [IsSuperAdmin()]

    def perform_create(self, serializer):
        user = serializer.save()
        _log(self.request, AuditLog.CREATE, record_id=str(user.id),
             record_repr=user.email, new=UserSerializer(user).data)


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.select_related('role')
    serializer_class = UserSerializer
    lookup_field = 'id'
    permission_classes = [IsITManager]

    def perform_update(self, serializer):
        old = UserSerializer(serializer.instance).data
        user = serializer.save()
        _log(self.request, AuditLog.UPDATE, record_id=str(user.id),
             record_repr=user.email, old=dict(old), new=UserSerializer(user).data)

    def perform_destroy(self, instance):
        _log(self.request, AuditLog.DELETE, record_id=str(instance.id), record_repr=instance.email)
        instance.is_active = False
        instance.save(update_fields=['is_active'])


class RoleListView(generics.ListAPIView):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer


class PasswordResetRequestView(APIView):
    """POST /api/auth/password-reset/request/ — send reset email."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        if not email:
            return Response({'detail': 'Email is required.'}, status=400)
        # Always return 200 to prevent email enumeration
        try:
            from .models import PasswordResetToken
            user = User.objects.get(email=email, is_active=True)
            token = PasswordResetToken.create_for_user(user)
            token.send_reset_email()
        except User.DoesNotExist:
            pass  # Don't reveal whether email exists
        return Response({'detail': 'If an account with that email exists, a reset link has been sent.'})


class PasswordResetConfirmView(APIView):
    """POST /api/auth/password-reset/confirm/ — validate token and set new password."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from .models import PasswordResetToken
        from django.utils import timezone as tz
        import uuid as _uuid
        token_str = request.data.get('token', '')
        new_password = request.data.get('new_password', '')
        if len(new_password) < 10:
            return Response({'detail': 'Password must be at least 10 characters.'}, status=400)
        try:
            token = PasswordResetToken.objects.select_related('user').get(
                token=_uuid.UUID(str(token_str))
            )
        except (PasswordResetToken.DoesNotExist, ValueError):
            return Response({'detail': 'Invalid or expired reset link.'}, status=400)
        if not token.is_valid():
            return Response({'detail': 'This reset link has expired. Please request a new one.'}, status=400)
        token.user.set_password(new_password)
        token.user.save(update_fields=['password'])
        token.used_at = tz.now()
        token.save(update_fields=['used_at'])
        AuditLog.objects.create(
            user_email=token.user.email,
            action=AuditLog.UPDATE,
            module='accounts',
            record_id=str(token.user.id),
            record_repr='Password reset via email link',
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        return Response({'detail': 'Password has been reset. You can now log in.'})
