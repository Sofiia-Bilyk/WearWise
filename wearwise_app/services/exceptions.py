class ServiceError(Exception):
    """Base exception for all service-related errors."""
    code = 500

class ValidationError(ServiceError):
    """Raised when domain validation fails."""
    code = 400

class NotFoundError(ServiceError):
    """Raised when a requested resource is not found."""
    code = 404

class ForbiddenError(ServiceError):
    """Raised when a user lacks permission for an action."""
    code = 403

class UnsupportedMediaTypeError(ServiceError):
    """Raised when an uploaded file type is not supported."""
    code = 415

class PayloadTooLargeError(ServiceError):
    """Raised when an upload exceeds size limits."""
    code = 413
