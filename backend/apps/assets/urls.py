from django.urls import include, path

from . import views
from .acceptance_views import AssetAcceptanceActionView, AssetAcceptanceDetailView

asset_extra = [
    path('status/', views.AssetStatusUpdateView.as_view()),
    path('assign/', views.AssetAssignView.as_view()),
]

urlpatterns = [
    path('sites/', views.SiteListCreateView.as_view()),
    path('sites/<int:pk>/', views.SiteDetailView.as_view()),
    path('assets/hardware/', views.HardwareAssetListCreateView.as_view()),
    path('assets/hardware/warranty-alerts/', views.WarrantyExpiryListView.as_view()),
    path('assets/hardware/archived/', views.ArchivedAssetListView.as_view()),
    path('assets/hardware/<uuid:pk>/', views.HardwareAssetDetailView.as_view()),
    path('assets/hardware/<uuid:pk>/', include(asset_extra)),
    path('assets/hardware/<uuid:pk>/qr/', views.AssetQRView.as_view()),
    path('assets/hardware/<uuid:pk>/audit-logs/', views.AssetAuditLogListView.as_view()),
    path('assets/hardware/<uuid:pk>/archive/', views.HardwareAssetArchiveView.as_view()),
    path('assets/hardware/<uuid:pk>/unarchive/', views.HardwareAssetUnarchiveView.as_view()),
    # Asset acceptance workflow — GET returns details, POST processes accept/reject
    path('assets/hardware/<uuid:pk>/accept/', AssetAcceptanceDetailView.as_view()),
    path('assets/hardware/<uuid:pk>/accept/action/', AssetAcceptanceActionView.as_view()),
    path('scan/<uuid:token>/', views.ScanAssetView.as_view()),
    path('scan/<uuid:token>/action/', views.ScanActionView.as_view()),
]
