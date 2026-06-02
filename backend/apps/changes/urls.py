from django.urls import include, path

from . import views

change_extra = [
    path('assign/', views.ChangeAssignView.as_view()),
    path('status/', views.ChangeStatusView.as_view()),
    path('comments/', views.ChangeCommentListCreateView.as_view()),
    path('archive/', views.ChangeArchiveView.as_view()),
    path('unarchive/', views.ChangeUnarchiveView.as_view()),
    path('sprint/', views.ChangeSprintView.as_view()),
]

urlpatterns = [
    path('changes/', views.ChangeListCreateView.as_view()),
    path('changes/kanban/', views.ChangeKanbanView.as_view()),
    path('changes/archived/', views.ArchivedChangeListView.as_view()),
    path('changes/<uuid:pk>/', views.ChangeDetailView.as_view()),
    path('changes/<uuid:pk>/', include(change_extra)),
    path('sprints/', views.SprintListCreateView.as_view()),
    path('sprints/<uuid:pk>/', views.SprintDetailView.as_view()),
    path('sprints/<uuid:pk>/start/', views.SprintStartView.as_view()),
    path('sprints/<uuid:pk>/complete/', views.SprintCompleteView.as_view()),
    path('sprints/<uuid:pk>/changes/', views.SprintChangesView.as_view()),
]
