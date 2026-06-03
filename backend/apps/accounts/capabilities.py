"""
Capability-based RBAC.
Instead of checking `user.role.name == 'it_manager'` everywhere,
check `has_capability(user, 'ticket.assign')`.

This decouples business logic from hard-coded role strings and allows
fine-grained permission overrides per user in future.
"""
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import User

# Map capability name → list of roles that hold it by default
CAPABILITY_MAP: dict = {
    # ── Tickets ──────────────────────────────────────────────────────────
    'ticket.create':            ['super_admin', 'it_manager', 'it_agent', 'requestor'],
    'ticket.view_all':          ['super_admin', 'it_manager', 'it_agent', 'auditor'],
    'ticket.update':            ['super_admin', 'it_manager', 'it_agent'],
    'ticket.assign':            ['super_admin', 'it_manager', 'it_agent'],
    'ticket.resolve':           ['super_admin', 'it_manager', 'it_agent'],
    'ticket.close':             ['super_admin', 'it_manager', 'it_agent'],
    'ticket.reopen':            ['super_admin', 'it_manager', 'it_agent'],
    'ticket.archive':           ['super_admin', 'it_manager', 'it_agent'],
    'ticket.override_sla':      ['super_admin', 'it_manager'],
    'ticket.delete_comment':    ['super_admin', 'it_manager'],
    # ── Assets ───────────────────────────────────────────────────────────
    'asset.view':               ['super_admin', 'it_manager', 'it_agent', 'auditor'],
    'asset.create':             ['super_admin', 'it_manager', 'it_agent'],
    'asset.update':             ['super_admin', 'it_manager', 'it_agent'],
    'asset.assign':             ['super_admin', 'it_manager', 'it_agent'],
    'asset.archive':            ['super_admin', 'it_manager'],
    'asset.discover':           ['super_admin', 'it_manager', 'it_agent'],
    # ── Changes ──────────────────────────────────────────────────────────
    'change.create':            ['super_admin', 'it_manager', 'it_agent'],
    'change.approve':           ['super_admin', 'it_manager'],
    'change.archive':           ['super_admin', 'it_manager'],
    # ── Users & Roles ────────────────────────────────────────────────────
    'user.create':              ['super_admin'],
    'user.update':              ['super_admin', 'it_manager'],
    'user.deactivate':          ['super_admin'],
    'role.assign':              ['super_admin'],
    # ── Settings ─────────────────────────────────────────────────────────
    'settings.email':           ['super_admin'],
    'settings.teams':           ['super_admin'],
    'settings.sla':             ['super_admin', 'it_manager'],
    'settings.categories':      ['super_admin', 'it_manager'],
    'settings.custom_fields':   ['super_admin', 'it_manager'],
    # ── Audit ────────────────────────────────────────────────────────────
    'audit.view':               ['super_admin', 'it_manager', 'it_agent', 'auditor'],
    'audit.export':             ['super_admin', 'it_manager', 'auditor'],
    # ── Reports ──────────────────────────────────────────────────────────
    'report.view':              ['super_admin', 'it_manager', 'it_agent', 'auditor'],
    # ── Catalog & KB ─────────────────────────────────────────────────────
    'catalog.manage':           ['super_admin', 'it_manager'],
    'knowledge.publish':        ['super_admin', 'it_manager', 'it_agent'],
    # ── Problems ─────────────────────────────────────────────────────────
    'problem.manage':           ['super_admin', 'it_manager', 'it_agent'],
}


def has_capability(user: 'User', capability: str) -> bool:
    """
    Return True if the user's role grants the requested capability.
    Super admins always pass. Returns False for unauthenticated users.
    """
    if not user or not user.is_authenticated:
        return False
    if not user.is_active:
        return False
    role_name = user.role.name if user.role else ''
    if role_name == 'super_admin':
        return True
    return role_name in CAPABILITY_MAP.get(capability, [])


def require_capability(capability: str):
    """
    DRF permission class factory.
    Usage:  permission_classes = [require_capability('ticket.assign')]
    """
    from rest_framework.permissions import BasePermission

    class CapabilityPermission(BasePermission):
        message = f'You do not have the "{capability}" capability.'

        def has_permission(self, request, view):
            return has_capability(request.user, capability)

    CapabilityPermission.__name__ = f'Has_{capability.replace(".", "_")}'
    return CapabilityPermission
