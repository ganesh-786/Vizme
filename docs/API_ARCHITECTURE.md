# API Architecture Documentation

## Overview

The Unified Visibility Platform API is a professional Node.js/Express-based REST API designed to collect metrics from client websites and push them to Prometheus for visualization in Grafana.

## System Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT WEBSITES                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Website A  │  │   Website B  │  │   Website C  │  ...    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                 │                  │                  │
│         └─────────────────┼──────────────────┘                  │
│                           │                                     │
│              ┌────────────▼────────────┐                        │
│              │  Client Library (JS)    │                        │
│              │  visibility-client.js   │                        │
│              └────────────┬────────────┘                        │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            │ HTTP POST /api/v1/metrics
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    BACKEND API SERVER                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Express Application                   │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │   Routes     │  │ Middleware   │  │ Controllers  │  │   │
│  │  │  - Metrics   │  │ - Validation │  │ - Metrics    │  │   │
│  │  │  - Health    │  │ - Rate Limit │  │ - Health     │  │   │
│  │  │  - ClientLib │  │ - Error      │  │ - ClientLib  │  │   │
│  │  │              │  │ - Logging    │  │              │  │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │   │
│  └─────────┼─────────────────┼─────────────────┼──────────┘   │
│            │                 │                 │               │
│            └─────────────────┼─────────────────┘               │
│                              │                                   │
│                    ┌─────────▼─────────┐                        │
│                    │ Prometheus Service │                        │
│                    │  - Format metrics  │                        │
│                    │  - Push to gateway │                        │
│                    └─────────┬─────────┘                        │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               │ HTTP PUT /metrics/job/{job}/instance/{instance}
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│              PROMETHEUS PUSHGATEWAY                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Receives pushed metrics from API                        │   │
│  │  Stores metrics temporarily                              │   │
│  │  Exposes metrics at /metrics endpoint                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ Scraping (HTTP GET /metrics)
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    PROMETHEUS TSDB                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Time Series Database                                    │   │
│  │  - Stores metrics with timestamps                       │   │
│  │  - Provides PromQL query interface                       │   │
│  │  - Retention: 30 days (configurable)                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ PromQL Queries
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                      GRAFANA                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Visualization Platform                                  │   │
│  │  - Dashboards                                            │   │
│  │  - Charts and Graphs                                     │   │
│  │  - Alerts                                                │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Client Library (`visibility-client.js`)

**Location**: `backend/clientlib/visibility-client.js`

**Purpose**: Embeddable JavaScript library that websites can include to automatically track metrics.

**Features**:

- Automatic page view tracking
- Custom event tracking
- Batch metric collection
- Automatic flushing on page unload
- SPA (Single Page Application) support
- LocalStorage-based client ID generation

**Usage Flow**:

```javascript
// 1. Include script
<script src="http://api-url/api/v1/client/script.js"></script>;

// 2. Initialize
VisibilityTracker.init({
  apiUrl: "http://api-url",
  clientId: "unique-client-id",
  autoTrack: true,
});

// 3. Track metrics (automatic or manual)
VisibilityTracker.track("button_clicks", 1, { button: "signup" });
```

### 2. Backend API Server

**Technology Stack**:

- Node.js 18+
- Express.js 4.x
- Winston (Logging)
- Axios (HTTP client)
- Express Validator (Validation)
- Express Rate Limit (Rate limiting)

**Key Components**:

#### 2.1 Application Structure (`src/app.js`)

- Express app initialization
- Middleware configuration (CORS, Helmet, Body Parser)
- Route registration
- Error handling

#### 2.2 Routes (`src/routes/`)

- **Metrics Routes** (`metrics.routes.js`): POST `/api/v1/metrics`
- **Health Routes** (`health.routes.js`): GET `/api/v1/health/*`
- **Client Library Routes** (`clientlib.routes.js`): GET `/api/v1/client/*`

#### 2.3 Controllers (`src/api/controllers/`)

- **Metrics Controller**: Validates and processes metric requests
- **Health Controller**: Provides health check endpoints
- **ClientLib Controller**: Serves the client library JavaScript

#### 2.4 Middleware (`src/middleware/`)

- **Error Handler**: Global error handling with consistent responses
- **Request Logger**: Logs all incoming requests
- **Rate Limiter**: Prevents API abuse (100 req/min default)

#### 2.5 Prometheus Service (`src/tsdb/prometheus.service.js`)

- Formats metrics according to Prometheus text format
- Sanitizes metric names and labels
- Pushes metrics to Pushgateway via HTTP PUT
- Handles errors and retries

### 3. Prometheus Pushgateway

**Purpose**: Intermediate service that receives pushed metrics and makes them available for Prometheus to scrape.

**Why Pushgateway?**

- Clients (websites) are ephemeral and not always accessible
- Pushgateway provides a persistent endpoint for metric collection
- Prometheus can scrape Pushgateway on a schedule

**Configuration**:

- Port: 9091
- Endpoint: `/metrics/job/{job}/instance/{instance}`
- Method: PUT (push), GET (scrape), DELETE (cleanup)

### 4. Prometheus TSDB

**Purpose**: Time Series Database that stores metrics with timestamps.

**Configuration**:

- Scrapes Pushgateway every 15 seconds
- Retention: 30 days (configurable)
- Query language: PromQL

### 5. Grafana

**Purpose**: Visualization platform that queries Prometheus and displays dashboards.

**Configuration**:

- Pre-configured Prometheus datasource
- Accessible at http://localhost:3000

## Data Flow Example

### Scenario: User visits a website with the client library

1. **Page Load**:

   ```
   Website → Client Library loads → VisibilityTracker.init()
   ```

2. **Automatic Tracking**:

   ```
   Client Library → Tracks page view → Queues metric
   ```

3. **Batch Collection**:

   ```
   Client Library → Collects 10 metrics OR 5 seconds elapsed → Flushes queue
   ```

4. **API Request**:

   ```
   Client Library → POST /api/v1/metrics → Backend API
   ```

5. **Validation**:

   ```
   Backend API → Validates request → Rate limiting check
   ```

6. **Processing**:

   ```
   Backend API → Formats metrics → Enriches with labels
   ```

7. **Push to Prometheus**:

   ```
   Backend API → PUT /metrics/job/web_client/instance/client-123 → Pushgateway
   ```

8. **Scraping**:

   ```
   Prometheus → Scrapes Pushgateway → Stores in TSDB
   ```

9. **Visualization**:
   ```
   Grafana → Queries Prometheus → Displays dashboard
   ```

## Request/Response Examples

### Push Metrics Request

**Endpoint**: `POST /api/v1/metrics`

**Request**:

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
        "user_agent": "Mozilla/5.0..."
      }
    },
    {
      "name": "button_clicks_total",
      "value": 1,
      "type": "counter",
      "labels": {
        "button_id": "signup-button",
        "page": "/home"
      }
    }
  ],
  "job": "web_client",
  "instance": "client-abc123"
}
```

**Response**:

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

### Health Check Request

**Endpoint**: `GET /api/v1/health`

**Response**:

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

## Security Considerations

1. **Rate Limiting**: Prevents abuse (100 requests/minute per IP)
2. **Input Validation**: All inputs validated using express-validator
3. **CORS**: Configurable CORS origins
4. **Helmet**: Security headers middleware
5. **Error Handling**: No sensitive information exposed in errors

## Scalability

1. **Horizontal Scaling**: API can be scaled horizontally behind a load balancer
2. **Stateless**: API is stateless, no session storage required
3. **Pushgateway**: Handles high-volume metric pushes
4. **Prometheus**: Efficient time-series storage and querying

## Future Enhancements

1. **Authentication**: OAuth 2.0 integration (planned)
2. **Multi-tenancy**: Support for multiple clients with isolation
3. **Metric Aggregation**: Pre-aggregation for common queries
4. **Alerting**: Integration with Alertmanager
5. **API Keys**: Per-client API key authentication

## Monitoring

The API exposes health endpoints for monitoring:

- `/api/v1/health` - Basic health check
- `/api/v1/health/ready` - Readiness probe (checks dependencies)
- `/api/v1/health/live` - Liveness probe

## Logging

All requests and errors are logged using Winston:

- Request logs: Method, path, status, duration
- Error logs: Error message, stack trace, context
- Log levels: debug, info, warn, error

Logs are written to:

- Console (development)
- `logs/combined.log` (all logs)
- `logs/error.log` (errors only)
