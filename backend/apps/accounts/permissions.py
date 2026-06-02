from rest_framework.permissions import BasePermission
from .models import Role


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return _has_role(request, Role.SUPER_ADMIN)


class IsITManager(BasePermission):
    def has_permission(self, request, view):
        return _has_role(request, Role.SUPER_ADMIN, Role.IT_MANAGER)


class IsITAgent(BasePermission):
    def has_permission(self, request, view):
        return _has_role(request, Role.SUPER_ADMIN, Role.IT_MANAGER, Role.IT_AGENT)


class IsAuditor(BasePermission):
    def has_permission(self, request, view):
        return _has_role(request, Role.SUPER_ADMIN, Role.AUDITOR)


class IsRequestor(BasePermission):
    """Any authenticated user may submit tickets."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


def _has_role(request, *roles):
    return bool(
        request.user
        and request.user.is_authenticated
        and request.user.role
        and request.user.role.name in roles
    )
