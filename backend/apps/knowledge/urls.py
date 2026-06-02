from django.urls import path

from . import views

urlpatterns = [
    # Public (no auth)
    path('knowledge/public/', views.PublicKBListView.as_view(), name='kb-public-list'),
    path('knowledge/public/<slug:slug>/', views.PublicKBArticleView.as_view(), name='kb-public-article'),
    path('knowledge/search/', views.KBSearchView.as_view(), name='kb-search'),
    path('knowledge/categories/', views.KBCategoryListView.as_view(), name='kb-categories'),

    # Internal management (IT Agents)
    path('knowledge/articles/', views.KBArticleAdminListCreateView.as_view(), name='kb-articles'),
    path('knowledge/articles/<uuid:pk>/', views.KBArticleAdminDetailView.as_view(), name='kb-article-detail'),
    path('knowledge/articles/<uuid:pk>/vote/', views.KBArticleVoteView.as_view(), name='kb-article-vote'),
]
