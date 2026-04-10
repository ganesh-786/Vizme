"""Custom exception hierarchy for Vizme Python SDK."""


class VizmeClientError(Exception):
    """Base exception for client-side and API errors."""


class VizmeValidationError(VizmeClientError):
    """Raised when metric data is invalid before sending."""


class VizmeAuthError(VizmeClientError):
    """Raised on authentication or authorization failures."""


class VizmeServerError(VizmeClientError):
    """Raised on non-success server responses."""


class VizmeNetworkError(VizmeClientError):
    """Raised on network failures while sending metrics."""
