from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsITAgent, IsITManager

from .models import CatalogCategory, CatalogItem, ServiceRequest
from .serializers import (
    CatalogCategorySerializer,
    CatalogItemSerializer,
    ServiceRequestCreateSerializer,
    ServiceRequestDetailSerializer,
    ServiceRequestListSerializer,
    ServiceRequestStatusUpdateSerializer,
)


# ── Public (self-service portal, no auth) ────────────────────────────────────

class PublicCatalogListView(APIView):
    """GET /api/catalog/public/ — all active categories with their active items."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        categories = (
            CatalogCategory.objects
            .filter(is_active=True)
            .prefetch_related('items')
        )
        data = []
        for cat in categories:
            cat_data = CatalogCategorySerializer(cat).data
            items = cat.items.filter(is_active=True)
            cat_data['items'] = CatalogItemSerializer(items, many=True).data
            data.append(cat_data)
        return Response(data)


class PublicCatalogItemView(APIView):
    """GET /api/catalog/public/{id}/ — item detail including form_fields."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        item = get_object_or_404(CatalogItem, pk=pk, is_active=True)
        return Response(CatalogItemSerializer(item).data)


# ── Category management ───────────────────────────────────────────────────────

class CatalogCategoryListView(generics.ListCreateAPIView):
    """GET/POST /api/catalog/categories/ — IT Manager manages categories."""
    queryset = CatalogCategory.objects.all()
    serializer_class = CatalogCategorySerializer

    def get_permissions(self):
        if self.request.method == 'GET':
            return [permissions.IsAuthenticated()]
        return [IsITManager()]


# ── Catalog item admin ────────────────────────────────────────────────────────

class CatalogItemAdminView(generics.ListCreateAPIView):
    """GET/POST /api/catalog/items/ — IT Manager manages catalog items."""
    queryset = CatalogItem.objects.select_related('category').all()
    serializer_class = CatalogItemSerializer
    permission_classes = [IsITManager]
    filterset_fields = ['category', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['display_order', 'name', 'created_at']


class CatalogItemDetailAdminView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/catalog/items/{id}/ — IT Manager."""
    queryset = CatalogItem.objects.select_related('category').all()
    serializer_class = CatalogItemSerializer
    permission_classes = [IsITManager]


# ── Service requests ──────────────────────────────────────────────────────────

class ServiceRequestListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/catalog/requests/ — own requests (users) or all requests (IT agents).
    POST /api/catalog/requests/ — submit a new service request.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = ServiceRequest.objects.select_related(
            'catalog_item', 'requested_by', 'linked_ticket'
        )
        # IT agents and managers see all; regular users see only their own
        if hasattr(user, 'role') and user.role and user.role.name in (
            'super_admin', 'it_manager', 'it_agent'
        ):
            return qs
        return qs.filter(requested_by=user)

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ServiceRequestCreateSerializer
        return ServiceRequestListSerializer

    def perform_create(self, serializer):
        serializer.save()


class ServiceRequestDetailView(generics.RetrieveAPIView):
    """GET /api/catalog/requests/{id}/ — request detail."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ServiceRequestDetailSerializer

    def get_queryset(self):
        user = self.request.user
        qs = ServiceRequest.objects.select_related(
            'catalog_item', 'requested_by', 'linked_ticket'
        )
        if hasattr(user, 'role') and user.role and user.role.name in (
            'super_admin', 'it_manager', 'it_agent'
        ):
            return qs
        return qs.filter(requested_by=user)


class ServiceRequestStatusView(APIView):
    """POST /api/catalog/requests/{id}/status/ — IT agent updates status + notes."""
    permission_classes = [IsITAgent]

    def post(self, request, pk):
        service_request = get_object_or_404(ServiceRequest, pk=pk)
        serializer = ServiceRequestStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service_request.status = serializer.validated_data['status']
        notes = serializer.validated_data.get('notes', '')
        if notes:
            service_request.notes = notes
        service_request.save()

        return Response(ServiceRequestDetailSerializer(service_request).data)
