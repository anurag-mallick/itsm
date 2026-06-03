from django.urls import path
from . import views

urlpatterns = [
    path('discovery/scans/', views.DiscoveryScanListCreateView.as_view()),
    path('discovery/scans/<uuid:pk>/', views.DiscoveryScanDetailView.as_view()),
    path('discovery/devices/<uuid:pk>/', views.DeviceDetailView.as_view()),
    path('discovery/devices/<uuid:pk>/rdp/', views.DeviceRDPFileView.as_view()),
    path('discovery/devices/<uuid:pk>/import/', views.DeviceImportView.as_view()),
    path('discovery/devices/<uuid:pk>/ignore/', views.DeviceIgnoreView.as_view()),
]
