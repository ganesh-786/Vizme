"""HTTP client for sending metrics to Vizme backend."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Union

import requests

from .exceptions import (
    VizmeAuthError,
    VizmeNetworkError,
    VizmeServerError,
    VizmeValidationError,
)
from .models import Metric


class VizmeClient:
    """Minimal production-minded client for /api/v1/metrics ingestion."""

    def __init__(
        self,
        api_key: str,
        endpoint: str,
        timeout: float = 5.0,
        session: Optional[requests.Session] = None,
    ) -> None:
        if not api_key or not isinstance(api_key, str):
            raise VizmeValidationError("api_key is required")
        if not endpoint or not isinstance(endpoint, str):
            raise VizmeValidationError("endpoint is required")

        self.api_key = api_key
        self.endpoint = endpoint.rstrip("/")
        self.timeout = timeout
        self.session = session or requests.Session()

    def send_metric(
        self,
        name: str,
        metric_type: str,
        value: Union[int, float],
        labels: Optional[Dict[str, Any]] = None,
        operation: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Send a single metric (wrapped as one-item batch)."""
        metric = Metric(
            name=name,
            metric_type=metric_type,
            value=float(value),
            labels=labels or {},
            operation=operation,
        )
        return self.send_batch([metric])

    def send_batch(self, metrics: Iterable[Union[Metric, Dict[str, Any]]]) -> Dict[str, Any]:
        """Send multiple metrics in one POST request."""
        metric_payloads = self._normalize_metrics(metrics)

        if len(metric_payloads) == 0:
            raise VizmeValidationError("metrics must contain at least one item")
        if len(metric_payloads) > 100:
            raise VizmeValidationError("metrics cannot exceed 100 items per request")

        payload = {"metrics": metric_payloads}
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
        }

        try:
            response = self.session.post(
                self.endpoint,
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise VizmeNetworkError(f"Network error while sending metrics: {exc}") from exc

        if response.status_code in (401, 403):
            raise VizmeAuthError(self._error_message(response))
        if 400 <= response.status_code < 500:
            raise VizmeValidationError(self._error_message(response))
        if response.status_code >= 500:
            raise VizmeServerError(self._error_message(response))

        return self._safe_json(response)

    def increment(
        self, name: str, value: Union[int, float] = 1, labels: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Convenience helper for counter increment semantics."""
        return self.send_metric(
            name=name,
            metric_type="counter",
            value=float(value),
            labels=labels or {},
            operation="increment",
        )

    def gauge(
        self,
        name: str,
        value: Union[int, float],
        labels: Optional[Dict[str, Any]] = None,
        operation: str = "set",
    ) -> Dict[str, Any]:
        """Convenience helper for gauge metrics."""
        return self.send_metric(
            name=name,
            metric_type="gauge",
            value=float(value),
            labels=labels or {},
            operation=operation,
        )

    @staticmethod
    def _safe_json(response: requests.Response) -> Dict[str, Any]:
        try:
            return response.json()
        except ValueError:
            return {"success": response.ok, "status_code": response.status_code, "text": response.text}

    @staticmethod
    def _error_message(response: requests.Response) -> str:
        try:
            body = response.json()
        except ValueError:
            body = {"message": response.text}
        message = body.get("message") or body.get("error") or str(body)
        return f"HTTP {response.status_code}: {message}"

    @staticmethod
    def _normalize_metrics(metrics: Iterable[Union[Metric, Dict[str, Any]]]) -> List[Dict[str, Any]]:
        payloads: List[Dict[str, Any]] = []
        for metric in metrics:
            if isinstance(metric, Metric):
                payloads.append(metric.to_payload())
                continue

            if isinstance(metric, dict):
                required = ("name", "type", "value")
                missing = [key for key in required if key not in metric]
                if missing:
                    raise VizmeValidationError(
                        f"Metric object missing required fields: {', '.join(missing)}"
                    )
                normalized = Metric(
                    name=metric["name"],
                    metric_type=metric["type"],
                    value=float(metric["value"]),
                    labels=metric.get("labels", {}),
                    operation=metric.get("operation"),
                )
                payloads.append(normalized.to_payload())
                continue

            raise VizmeValidationError("Each metric must be a Metric or dict object")
        return payloads
