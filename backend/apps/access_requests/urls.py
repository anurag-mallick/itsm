from django.urls import path
from . import views

urlpatterns = [
    path('access-requests/', views.AccessRequestListCreateView.as_view()),
    path('access-requests/review/<uuid:pk>/', views.ManagerReviewView.as_view()),
    path('access-requests/<uuid:pk>/', views.AccessRequestDetailView.as_view()),
    path('access-requests/<uuid:pk>/assign/', views.ITAssignmentView.as_view()),
    path('access-requests/<uuid:pk>/cancel/', views.AccessRequestCancelView.as_view()),
]
