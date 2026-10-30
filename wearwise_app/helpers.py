"""Backend helpers — currently just :class:`StorageHandler` for image uploads.

Auth lives in :mod:`wearwise_app.auth_guard`; serialization in
:mod:`wearwise_app.serializers`.
"""

import os
import uuid

from werkzeug.utils import secure_filename


class StorageHandler:
    """Saves uploaded images via the configured backend (local or S3).

    The actual write is delegated to a :class:`StorageProvider` chosen
    from the ``STORAGE_PROVIDER`` env var, so callers stay backend-agnostic.
    """

    @staticmethod
    def _get_provider():
        """Return the storage provider selected by ``STORAGE_PROVIDER``."""
        # Lazy import to avoid a circular import with services.storage_providers.
        from .services.storage_providers import LocalStorageProvider, S3StorageProvider

        provider_type = os.environ.get('STORAGE_PROVIDER', 'LOCAL').upper()
        if provider_type == 'S3':
            return S3StorageProvider()
        return LocalStorageProvider()

    @staticmethod
    def save_file(file_data, upload_folder, is_base64=False, ext='.jpg'):
        """Persist file data and return the URL/path clients can fetch.

        Args:
            file_data: Raw bytes if ``is_base64``, else a Werkzeug FileStorage.
            upload_folder: Destination folder (or bucket prefix for cloud).
            is_base64: True for decoded base64 bytes, False for upload objects.
            ext: Fallback extension when one can't be inferred.
        """
        # uuid filename prevents collisions between concurrent uploads.
        if is_base64:
            filename = f"crop_{uuid.uuid4().hex}{ext}"
        else:
            safe_name = secure_filename(file_data.filename) if file_data.filename else ''
            ext = os.path.splitext(safe_name)[1] if safe_name else '.jpg'
            filename = f"{uuid.uuid4().hex}{ext}"

        return StorageHandler._get_provider().save(file_data, upload_folder, filename)
