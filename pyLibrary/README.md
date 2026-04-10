# Vizme Python Library

Minimal Python SDK for sending metrics to Vizme backend ingestion endpoint.

## Install

```bash
pip install -e .
```

From inside `pyLibrary`, this installs the local package in editable mode.

## Quick Start

```python
from vizme import VizmeClient

client = VizmeClient(
    api_key="mk_your_api_key_here",
    endpoint="http://localhost:3000/api/v1/metrics",
)

response = client.send_metric(
    name="checkout_started",
    metric_type="counter",
    value=1,
    labels={"page": "/pricing", "plan": "pro"},
)

print(response)
```

## Send Batch

```python
from vizme import Metric, VizmeClient

client = VizmeClient(
    api_key="mk_your_api_key_here",
    endpoint="http://localhost:3000/api/v1/metrics",
)

response = client.send_batch(
    [
        Metric(name="page_views", metric_type="counter", value=1, labels={"page": "/home"}),
        Metric(name="api_latency_ms", metric_type="histogram", value=123.4, labels={"route": "/orders"}),
        {
            "name": "active_users",
            "type": "gauge",
            "value": 57,
            "labels": {"region": "in"},
            "operation": "set",
        },
    ]
)

print(response)
```

## Helpers

```python
client.increment("orders_created", value=1, labels={"source": "web"})
client.gauge("queue_depth", value=12, labels={"queue": "emails"})
```

## Notes

- Endpoint payload matches existing JS ingestion shape: `{"metrics":[...]}`.
- Default auth header is `X-API-Key`.
- Max batch size is 100 metrics per request.
