from django.apps import AppConfig


class EmailProcessorConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.email_processor'
    label = 'email_processor'
