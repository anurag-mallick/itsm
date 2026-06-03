from django.urls import path

from . import views

urlpatterns = [
    path('email-config/inbound/', views.InboundMailboxListCreateView.as_view()),
    path('email-config/inbound/<uuid:pk>/', views.InboundMailboxDetailView.as_view()),
    path('email-config/inbound/<uuid:pk>/test/', views.InboundMailboxTestView.as_view()),
    path('email-config/inbound/<uuid:pk>/poll-now/', views.TriggerPollView.as_view()),
]
