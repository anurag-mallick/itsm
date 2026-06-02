from django.urls import path

from . import views
from .calendar_views import CalendarEventsView
from .meta_views import MetaChoicesView
from .search_views import GlobalSearchView

urlpatterns = [
    path('meta/choices/', MetaChoicesView.as_view()),
    path('reports/dashboard/', views.DashboardStatsView.as_view()),
    path('reports/tickets/', views.TicketReportView.as_view()),
    path('reports/assets/', views.AssetReportView.as_view()),
    path('calendar/events/', CalendarEventsView.as_view()),
    path('search/', GlobalSearchView.as_view()),
]
