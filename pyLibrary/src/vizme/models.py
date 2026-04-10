"""Data models for Vizme metric ingestion payloads."""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from .exceptions import VizmeValidationError

METRIC_TYPES = {"counter", "gauge", "histogram", "summary"}
OPERATIONS = {"increment", "decrement", "set"}


@dataclass
class Metric:
    """Single metric entry in the ingestion payload."""

    name: str
    metric_type: str
    value: float
    labels: Dict[str, Any] = field(default_factory=dict)
    operation: Optional[str] = None

    def validate(self) -> None:
        """Validate metric values using backend-compatible rules."""
        if not isinstance(self.name, str) or not self.name.strip():
            raise VizmeValidationError("Metric name must be a non-empty string")

        if self.metric_type not in METRIC_TYPES:
            raise VizmeValidationError(
                "Metric type must be one of: counter, gauge, histogram, summary"
            )

        try:
            numeric_value = float(self.value)
        except (TypeError, ValueError) as exc:
            raise VizmeValidationError("Metric value must be numeric") from exc

        if self.metric_type == "counter" and numeric_value < 0:
            raise VizmeValidationError("Counter metric value must be non-negative")

        if not isinstance(self.labels, dict):
            raise VizmeValidationError("Metric labels must be an object/dict")

        if self.operation is not None and self.operation not in OPERATIONS:
            raise VizmeValidationError(
                "Metric operation must be one of: increment, decrement, set"
            )

    def to_payload(self) -> Dict[str, Any]:
        """Return backend-compatible metric payload item."""
        self.validate()
        payload: Dict[str, Any] = {
            "name": self.name,
            "type": self.metric_type,
            "value": float(self.value),
            "labels": self.labels or {},
        }
        if self.operation is not None:
            payload["operation"] = self.operation
        return payload
