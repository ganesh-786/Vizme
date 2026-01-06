# Unified Visibility Platform - Backend API

Professional Node.js/Express API for collecting metrics from clients and pushing them to Prometheus.

## Architecture

```
Client Websites
    ↓ (HTTP POST)
Backend API (Express)
    ↓ (HTTP PUT)
Prometheus Pushgateway
    ↓ (Scraping)
Prometheus TSDB
    ↓ (Querying)
Grafana Dashboards
```

## Project Structure

```
backend/
├── src/
│   ├── index.js                 # Main entry point
│   ├── app.js                   # Express app configuration
│   ├── config/                  # Configuration management
│   │   └── index.js
│   ├── api/                     # API layer
│   │   └── controllers/         # Request handlers
│   │       ├── metrics.controller.js
│   │       ├── health.controller.js
│   │       └── clientlib.controller.js
│   ├── routes/                  # Route definitions
│   │   ├── metrics.routes.js
│   │   ├── health.routes.js
│   │   └── clientlib.routes.js
│   ├── middleware/              # Custom middleware
│   │   ├── errorHandler.middleware.js
│   │   ├── requestLogger.middleware.js
│   │   └── rateLimiter.middleware.js
│   ├── tsdb/                    # Time Series DB integration
│   │   └── prometheus.service.js
│   └── utils/                   # Utility functions
│       └── logger.js
├── clientlib/                   # Client library
│   └── visibility-client.js    # Embeddable JavaScript
├── package.json
├── Dockerfile
└── README.md
```

## Features

- ✅ RESTful API for metrics ingestion
- ✅ Prometheus Pushgateway integration
- ✅ Embeddable client library for websites
- ✅ Request validation and error handling
- ✅ Rate limiting
- ✅ Comprehensive logging
- ✅ Health check endpoints
- ✅ CORS support
- ✅ Docker support

## API Endpoints

### Metrics

- `POST /api/v1/metrics` - Push metrics to Prometheus
  ```json
  {
    "metrics": [
      {
        "name": "page_views",
        "value": 1,
        "type": "counter",
        "labels": {
          "page": "/home",
          "user_id": "123"
        }
      }
    ],
    "job": "web_client",
    "instance": "client-123"
  }
  ```

### Health

- `GET /api/v1/health` - Basic health check
- `GET /api/v1/health/ready` - Readiness probe
- `GET /api/v1/health/live` - Liveness probe

### Client Library

- `GET /api/v1/client/script.js` - Serve embeddable client library
- `GET /api/v1/client` - Client library information

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## Environment Variables

See `env.template` for all available configuration options.

Key variables:
- `PORT` - Server port (default: 8000)
- `PROMETHEUS_PUSHGATEWAY_URL` - Pushgateway URL
- `CORS_ORIGINS` - Allowed CORS origins
- `LOG_LEVEL` - Logging level (info, debug, error)

## Docker

```bash
# Build image
docker build -t unified-visibility-backend .

# Run container
docker run -p 8000:8000 \
  -e PROMETHEUS_PUSHGATEWAY_URL=http://pushgateway:9091 \
  unified-visibility-backend
```

## Client Library Usage

### Basic Embedding

```html
<script src="http://your-api-url/api/v1/client/script.js"></script>
<script>
  VisibilityTracker.init({
    apiUrl: 'http://your-api-url',
    clientId: 'your-client-id',
    autoTrack: true
  });
</script>
```

### Manual Tracking

```javascript
// Track custom metric
VisibilityTracker.track('button_clicks', 1, {
  button_id: 'signup-button',
  page: '/home'
});

// Track event
VisibilityTracker.trackEvent('user_signup', 1, {
  plan: 'premium'
});
```

## Development

```bash
# Run with nodemon (auto-reload)
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

## Production Deployment

1. Set environment variables
2. Build Docker image
3. Deploy with docker-compose or Kubernetes
4. Ensure Prometheus Pushgateway is accessible
5. Configure Prometheus to scrape Pushgateway

## License

[To be specified]

