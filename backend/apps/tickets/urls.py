from django.urls import include, path

from . import views
from .portal_views import PortalCategoryListView, PortalTicketSubmitView, PortalTicketStatusView

ticket_extra = [
    path('assign/', views.TicketAssignView.as_view()),
    path('status/', views.TicketStatusView.as_view()),
    path('comments/', views.CommentListCreateView.as_view()),
    path('attachments/', views.AttachmentUploadView.as_view()),
]

urlpatterns = [
    path('categories/', views.CategoryListCreateView.as_view()),
    path('categories/<int:pk>/', views.CategoryDetailView.as_view()),
    path('tickets/', views.TicketListCreateView.as_view()),
    path('tickets/archived/', views.ArchivedTicketListView.as_view()),
    path('tickets/<uuid:pk>/', views.TicketDetailView.as_view()),
    path('tickets/<uuid:pk>/', include(ticket_extra)),
    path('tickets/<uuid:pk>/archive/', views.TicketArchiveView.as_view()),
    path('tickets/<uuid:pk>/unarchive/', views.TicketUnarchiveView.as_view()),
    path('canned-responses/', views.CannedResponseListCreateView.as_view()),
    path('canned-responses/<uuid:pk>/', views.CannedResponseDetailView.as_view()),
    # Guest portal — public, no authentication required
    path('portal/categories/', PortalCategoryListView.as_view()),
    path('portal/submit/', PortalTicketSubmitView.as_view()),
    path('portal/status/<str:ticket_number>/', PortalTicketStatusView.as_view()),
]
