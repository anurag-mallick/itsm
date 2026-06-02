from django.urls import path

from .views import TeamsWebhookView

urlpatterns = [
    path('teams/webhook/', TeamsWebhookView.as_view()),
]
