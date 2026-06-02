from rest_framework import generics, permissions
from django_filters.rest_framework import DjangoFilterBackend

from .models import FieldSchema
from .serializers import FieldSchemaSerializer
from apps.audit.mixins import AuditMixin
from apps.accounts.permissions import IsSuperAdmin, IsITManager


class FieldSchemaListCreateView(AuditMixin, generics.ListCreateAPIView):
    serializer_class = FieldSchemaSerializer
    audit_module = 'custom_fields'
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['module', 'category_id', 'is_active']

    def get_queryset(self):
        return FieldSchema.objects.all()

    def get_permissions(self):
        return [permissions.IsAuthenticated()] if self.request.method == 'GET' else [IsSuperAdmin()]


class FieldSchemaDetailView(AuditMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = FieldSchema.objects.all()
    serializer_class = FieldSchemaSerializer
    audit_module = 'custom_fields'

    def get_permissions(self):
        return [permissions.IsAuthenticated()] if self.request.method == 'GET' else [IsSuperAdmin()]
