# API Documentation

## Overview

The Unified Visibility Platform API provides REST endpoints for collecting metrics from client applications and pushing them to Prometheus for visualization.

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

Currently, authentication is not implemented. OAuth 2.0 integration is planned for future releases.

## Rate Limiting

- **Limit**: 100 requests per minute per IP address
- **Headers**: Rate limit information is included in response headers
- **Response**: 429 Too Many Requests when limit exceeded

## Endpoints

### Metrics

#### Push Metrics

Submit metrics to be stored in Prometheus.

```
POST /metrics
```

**Request Headers**:

```
Content-Type: application/json
X-Client-Id: your-client-id (optional)
```

**Request Body**:

```json
{
  "metrics": [
    {
      "name": "page_views_total",
      "value": 1,
      "type": "counter",
      "labels": {
        "page": "/home",
        "referrer": "https://google.com",
        "user_id": "123"
      }
    },
    {
      "name": "response_time_seconds",
      "value": 0.234,
      "type": "gauge",
      "labels": {
        "endpoint": "/api/users",
        "method": "GET"
      }
    }
  ],
  "job": "web_client",
  "instance": "client-abc123",
  "labels": {
    "environment": "production",
    "region": "us-east-1"
  }
}
```

**Field Descriptions**:

- `metrics` (required): Array of metric objects (1-100 items)
  - `name` (required): Metric name (max 200 chars, alphanumeric, underscores, colons)
  - `value` (required): Numeric value
  - `type` (optional): Metric type - `counter`, `gauge`, `histogram`, `summary` (default: `gauge`)
  - `labels` (optional): Key-value pairs for metric labels (max 20 labels)
- `job` (optional): Job identifier for Prometheus (default: `unified_visibility_platform`)
- `instance` (optional): Instance identifier (default: `api-server`)
- `labels` (optional): Additional labels applied to all metrics

**Response** (200 OK):

```json
{
  "success": true,
  "message": "Metrics pushed successfully",
  "data": {
    "metricsCount": 2,
    "job": "web_client",
    "instance": "client-abc123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Responses**:

400 Bad Request - Validation Error:

```json
{
  "error": true,
  "message": "Validation failed",
  "errors": [
    {
      "field": "metrics[0].name",
      "message": "Metric name is required"
    }
  ]
}
```

429 Too Many Requests:

```json
{
  "error": true,
  "message": "Too many requests from this IP, please try again later.",
  "retryAfter": 60
}
```

500 Internal Server Error:

```json
{
  "error": true,
  "message": "Internal Server Error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/v1/metrics"
}
```

**Example** (cURL):

```bash
curl -X POST http://localhost:8000/api/v1/metrics \
  -H "Content-Type: application/json" \
  -H "X-Client-Id: my-client-123" \
  -d '{
    "metrics": [
      {
        "name": "api_requests_total",
        "value": 1,
        "type": "counter",
        "labels": {
          "endpoint": "/api/users",
          "method": "GET",
          "status": "200"
        }
      }
    ],
    "job": "api_server",
    "instance": "server-1"
  }'
```

### Health

#### Basic Health Check

Check if the API service is running.

```
GET /health
```

**Response** (200 OK):

```json
{
  "status": "healthy",
  "service": "unified-visibility-platform-api",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "environment": "development"
}
```

#### Readiness Check

Check if the API is ready to serve requests (checks dependencies).

```
GET /health/ready
```

**Response** (200 OK - Ready):

```json
{
  "status": "ready",
  "checks": {
    "api": "ok",
    "prometheus": "ok"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Response** (503 Service Unavailable - Not Ready):

```json
{
  "status": "not ready",
  "checks": {
    "api": "ok",
    "prometheus": "unavailable"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Liveness Check

Check if the API process is alive.

```
GET /health/live
```

**Response** (200 OK):

```json
{
  "status": "alive",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600
}
```

### Client Library

#### Get Client Library Script

Retrieve the embeddable JavaScript client library.

```
GET /client/script.js
```

**Response** (200 OK):

- Content-Type: `application/javascript`
- Cache-Control: `public, max-age=3600`
- Body: JavaScript code for the client library

**Example**:

```html
<script src="http://localhost:8000/api/v1/client/script.js"></script>
```

#### Get Client Library Information

Get information about the client library and usage examples.

```
GET /client
```

**Response** (200 OK):

```json
{
  "name": "Unified Visibility Platform Client Library",
  "version": "1.0.0",
  "scriptUrl": "http://localhost:8000/api/v1/client/script.js",
  "usage": {
    "embed": "<script src=\"http://localhost:8000/api/v1/client/script.js\"></script>",
    "initialize": "...",
    "manualTracking": "..."
  },
  "endpoints": {
    "metrics": "http://localhost:8000/api/v1/metrics"
  }
}
```

## Response Format

### Success Response

All successful responses follow this format:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Response

All error responses follow this format:

```json
{
  "error": true,
  "message": "Error description",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/v1/endpoint"
}
```

In development mode, error responses may include a `stack` field with the error stack trace.

## Error Handling

### HTTP Status Codes

- `200 OK`: Request successful
- `400 Bad Request`: Invalid request data
- `404 Not Found`: Endpoint or resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `502 Bad Gateway`: Error communicating with Prometheus
- `503 Service Unavailable`: Service not ready

### Error Response Format

```json
{
  "error": true,
  "message": "Human-readable error message",
  "timestamp": "ISO 8601 timestamp",
  "path": "Request path"
}
```

For validation errors:

```json
{
  "error": true,
  "message": "Validation failed",
  "errors": [
    {
      "field": "field.path",
      "message": "Error message"
    }
  ]
}
```

## Metric Naming Conventions

Follow Prometheus naming conventions:

- Use lowercase letters and underscores
- End counters with `_total`
- End histograms with `_bucket`, `_sum`, `_count`
- Use units in metric names (e.g., `_seconds`, `_bytes`)
- Keep names concise but descriptive

**Examples**:

- ✅ `http_requests_total`
- ✅ `response_time_seconds`
- ✅ `memory_usage_bytes`
- ❌ `HTTPRequests` (mixed case)
- ❌ `response-time` (hyphens)
- ❌ `requests` (too generic)

## Label Best Practices

- Use labels to differentiate metric dimensions
- Keep label values bounded (avoid high cardinality)
- Use consistent label names across metrics
- Common labels: `job`, `instance`, `environment`, `region`

**Examples**:

```json
{
  "name": "http_requests_total",
  "value": 1,
  "labels": {
    "method": "GET",
    "status": "200",
    "endpoint": "/api/users"
  }
}
```

## Client Library Usage

### Basic Setup

```html
<!-- Include the client library -->
<script src="http://your-api-url/api/v1/client/script.js"></script>

<!-- Initialize -->
<script>
  VisibilityTracker.init({
    apiUrl: "http://your-api-url",
    clientId: "your-client-id",
    autoTrack: true,
  });
</script>
```

### Manual Tracking

```javascript
// Track a metric
VisibilityTracker.track("button_clicks", 1, {
  button_id: "signup-button",
  page: "/home",
});

// Track an event
VisibilityTracker.trackEvent("user_signup", 1, {
  plan: "premium",
});

// Track page view
VisibilityTracker.trackPageView();

// Manually flush metrics
VisibilityTracker.flush();
```

## Examples

### Example 1: Track Page Views

```javascript
// Automatic (with autoTrack: true)
VisibilityTracker.init({ apiUrl: "http://api-url", autoTrack: true });

// Manual
VisibilityTracker.trackPageView();
```

### Example 2: Track Custom Events

```javascript
VisibilityTracker.trackEvent("purchase_completed", 1, {
  product_id: "123",
  amount: 99.99,
  currency: "USD",
});
```

### Example 3: Track API Response Times

```javascript
const startTime = Date.now();
fetch("/api/data").then((response) => {
  const duration = (Date.now() - startTime) / 1000;
  VisibilityTracker.track("api_response_time_seconds", duration, {
    endpoint: "/api/data",
    method: "GET",
    status: response.status,
  });
});
```

## Testing

### Using cURL

```bash
# Health check
curl http://localhost:8000/api/v1/health

# Push metrics
curl -X POST http://localhost:8000/api/v1/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "metrics": [{
      "name": "test_metric",
      "value": 1,
      "labels": {"test": "true"}
    }]
  }'
```

### Using JavaScript (Fetch API)

```javascript
fetch("http://localhost:8000/api/v1/metrics", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Client-Id": "my-client",
  },
  body: JSON.stringify({
    metrics: [
      {
        name: "test_metric",
        value: 1,
        labels: { test: "true" },
      },
    ],
  }),
})
  .then((response) => response.json())
  .then((data) => console.log(data));
```

## Support

For issues and questions, please refer to:

- [Architecture Documentation](ARCHITECTURE.md)
- [API Architecture Documentation](API_ARCHITECTURE.md)
- [Development Guide](DEVELOPMENT.md)
