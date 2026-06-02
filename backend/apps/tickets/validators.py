import os
import logging
from django.conf import settings
from rest_framework.exceptions import ValidationError

logger = logging.getLogger('itsm.security')


def validate_uploaded_file(file):
    """Validate file extension and size. Raises ValidationError on failure."""
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        raise ValidationError(
            f'File type {ext} is not permitted. '
            f'Allowed: {", ".join(sorted(settings.ALLOWED_UPLOAD_EXTENSIONS))}'
        )
    if file.size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise ValidationError(
            f'File size {file.size / 1024 / 1024:.1f} MB exceeds the 10 MB limit.'
        )
    logger.info(f'File accepted: {file.name} ({file.size} bytes)')
    return file
