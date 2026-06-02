from django.urls import path

from . import views

urlpatterns = [
    path('software/licenses/', views.SoftwareLicenseListCreateView.as_view()),
    path('software/licenses/compliance/', views.ComplianceView.as_view()),
    path('software/licenses/expiry-alerts/', views.ExpiryAlertsView.as_view()),
    path('software/licenses/<uuid:pk>/', views.SoftwareLicenseDetailView.as_view()),
    path(
        'software/licenses/<uuid:pk>/installations/',
        views.SoftwareInstallationListCreateView.as_view(),
    ),
    path(
        'software/installations/<uuid:pk>/',
        views.SoftwareInstallationDetailView.as_view(),
    ),
    path('software/licenses/<uuid:pk>/timeline/', views.LicenseTimelineView.as_view()),
    path('software/licenses/<uuid:pk>/assigned-users/', views.LicenseAssignedUsersView.as_view()),
    path('software/seat-requests/', views.SeatRequestListCreateView.as_view()),
    path('software/seat-requests/<uuid:pk>/approve/', views.SeatRequestApproveView.as_view()),
]
