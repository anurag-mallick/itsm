from django.urls import path
from . import views

urlpatterns = [
    path('', views.FieldSchemaListCreateView.as_view()),
    path('<int:pk>/', views.FieldSchemaDetailView.as_view()),
]
