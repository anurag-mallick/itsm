from django.urls import path
from .views import AuditLogListView, AuditLogExportView

urlpatterns = [
    path('', AuditLogListView.as_view()),
    path('export/', AuditLogExportView.as_view()),
]
