from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView as SpectacularSwaggerUIView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include([
        path('', include('apps.accounts.urls')),
        path('audit/', include('apps.audit.urls')),
        path('custom-fields/', include('apps.custom_fields.urls')),
        path('', include('apps.tickets.urls')),
        path('', include('apps.assets.urls')),
        path('', include('apps.software.urls')),
        path('', include('apps.teams_bot.urls')),
        path('', include('apps.system_config.urls')),
        path('', include('apps.reports.urls')),
        path('', include('apps.changes.urls')),
        path('', include('apps.access_requests.urls')),
        path('', include('apps.notifications.urls')),
        path('', include('apps.discovery.urls')),
        path('', include('apps.catalog.urls')),
        path('', include('apps.knowledge.urls')),
        path('', include('apps.problems.urls')),
        path('schema/', SpectacularAPIView.as_view(), name='schema'),
        path('docs/', SpectacularSwaggerUIView.as_view(url_name='schema'), name='swagger-ui'),
    ])),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
