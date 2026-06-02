from django.urls import path
from . import views
from .user_assets_views import UserAssetSummaryView, UserDeallocateAssetsView

urlpatterns = [
    path('auth/login/', views.LoginView.as_view()),
    path('auth/logout/', views.LogoutView.as_view()),
    path('auth/token/refresh/', views.TokenRefreshView.as_view()),
    path('auth/me/', views.MeView.as_view()),
    path('auth/change-password/', views.ChangePasswordView.as_view()),
    path('users/', views.UserListCreateView.as_view()),
    path('users/<uuid:id>/', views.UserDetailView.as_view()),
    path('roles/', views.RoleListView.as_view()),
    path('auth/password-reset/request/', views.PasswordResetRequestView.as_view()),
    path('auth/password-reset/confirm/', views.PasswordResetConfirmView.as_view()),
    path('users/<uuid:user_id>/assets/', UserAssetSummaryView.as_view()),
    path('users/<uuid:user_id>/deallocate-assets/', UserDeallocateAssetsView.as_view()),
]
