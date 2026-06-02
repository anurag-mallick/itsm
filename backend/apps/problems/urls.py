from django.urls import path

from . import views

urlpatterns = [
    path('problems/', views.ProblemListCreateView.as_view(), name='problems-list'),
    path('problems/<uuid:pk>/', views.ProblemDetailView.as_view(), name='problems-detail'),
    path('problems/<uuid:pk>/link-ticket/', views.ProblemLinkTicketView.as_view(), name='problems-link-ticket'),
    path('problems/<uuid:pk>/unlink-ticket/', views.ProblemUnlinkTicketView.as_view(), name='problems-unlink-ticket'),
]
