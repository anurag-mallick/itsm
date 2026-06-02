from django.urls import path

from . import views

urlpatterns = [
    # Public (no auth)
    path('catalog/public/', views.PublicCatalogListView.as_view(), name='catalog-public-list'),
    path('catalog/public/<uuid:pk>/', views.PublicCatalogItemView.as_view(), name='catalog-public-item'),

    # Category management
    path('catalog/categories/', views.CatalogCategoryListView.as_view(), name='catalog-categories'),

    # Catalog item admin
    path('catalog/items/', views.CatalogItemAdminView.as_view(), name='catalog-items'),
    path('catalog/items/<uuid:pk>/', views.CatalogItemDetailAdminView.as_view(), name='catalog-item-detail'),

    # Service requests
    path('catalog/requests/', views.ServiceRequestListCreateView.as_view(), name='catalog-requests'),
    path('catalog/requests/<uuid:pk>/', views.ServiceRequestDetailView.as_view(), name='catalog-request-detail'),
    path('catalog/requests/<uuid:pk>/status/', views.ServiceRequestStatusView.as_view(), name='catalog-request-status'),
]
