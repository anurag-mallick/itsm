from rest_framework.permissions import BasePermission
from .models import Role
from .capabilities import has_capability


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role
            and request.user.role.name == Role.SUPER_ADMIN
        )


class IsITManager(BasePermission):
    def has_permission(self, request, view):
        # ticket.override_sla is granted to super_admin and it_manager only
        return has_capability(request.user, 'ticket.override_sla')


class IsITAgent(BasePermission):
    def has_permission(self, request, view):
        # ticket.update is granted to super_admin, it_manager, and it_agent
        return has_capability(request.user, 'ticket.update')


class IsAuditor(BasePermission):
    def has_permission(self, request, view):
        # audit.view is granted to super_admin, it_manager, it_agent, and auditor
        return has_capability(request.user, 'audit.view')


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
