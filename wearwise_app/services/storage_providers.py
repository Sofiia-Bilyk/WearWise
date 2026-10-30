import os
import uuid
from abc import ABC, abstractmethod

class StorageProvider(ABC):
    """
    Abstract Base Class for storage strategies (Strategy Pattern).
    Defines the interface for saving files across different platforms.
    """
    @abstractmethod
    def save(self, file_data, upload_folder, filename):
        """
        Save the provided file data and return the accessible URL/Path.
        
        Args:
            file_data: Raw bytes or FileStorage object.
            upload_folder: The logical folder for local storage (used as prefix/bucket for cloud).
            filename: The final generated filename.
        """
        pass

class LocalStorageProvider(StorageProvider):
    """Concrete strategy for local filesystem storage."""
    def save(self, file_data, upload_folder, filename):
        os.makedirs(upload_folder, exist_ok=True)
        save_path = os.path.join(upload_folder, filename)
        
        if hasattr(file_data, 'save'):
            # Werkzeug FileStorage object
            file_data.save(save_path)
        else:
            # Raw bytes (Base64)
            with open(save_path, 'wb') as f:
                f.write(file_data)
        
        return f"/uploads/{filename}"

class S3StorageProvider(StorageProvider):
    """Concrete strategy for AWS S3 storage (Stub)."""
    def save(self, file_data, upload_folder, filename):
        raise NotImplementedError("S3 storage provider is not yet implemented. Please set STORAGE_PROVIDER=LOCAL.")
