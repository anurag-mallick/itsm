from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Role


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['name', 'get_name_display']
    readonly_fields = ['name']


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['email', 'full_name', 'role', 'account_type', 'is_active', 'created_at']
    list_filter = ['role', 'account_type', 'is_active']
    search_fields = ['email', 'first_name', 'last_name']
    ordering = ['-created_at']
    readonly_fields = ['id', 'created_at', 'updated_at', 'last_login']

    fieldsets = (
        (None, {'fields': ('id', 'email', 'password')}),
        ('Personal Info', {'fields': ('first_name', 'last_name')}),
        ('Access', {'fields': ('role', 'account_type', 'is_active', 'is_staff', 'is_superuser')}),
        ('Timestamps', {'fields': ('last_login', 'created_at', 'updated_at')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2', 'role', 'account_type'),
        }),
    )

    filter_horizontal = ()
