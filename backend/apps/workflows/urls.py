from django.urls import path
from . import views

urlpatterns = [
    path('workflows/', views.WorkflowRuleListCreateView.as_view()),
    path('workflows/fields/', views.WorkflowFieldsView.as_view()),
    path('workflows/<uuid:pk>/', views.WorkflowRuleDetailView.as_view()),
    path('workflows/<uuid:pk>/test/', views.WorkflowTestView.as_view()),
]
