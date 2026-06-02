from django.apps import AppConfig


class SoftwareConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.software'
    label = 'software'

    def ready(self):
        import apps.software.signals  # noqa: F401
