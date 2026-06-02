from django.urls import path

from . import views

urlpatterns = [
    path('system-config/', views.SystemConfigListView.as_view()),
    path('system-config/sections/', views.SystemConfigSectionListView.as_view()),
    path('system-config/update/', views.SystemConfigUpdateView.as_view()),
    path('system-config/test-email/', views.SystemConfigTestEmailView.as_view()),
]
