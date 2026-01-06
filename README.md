# Unified Visibility Platform

A comprehensive metrics visualization system that allows clients to sign up, configure custom metrics, generate embeddable tracking code, and visualize their metrics in real-time through Prometheus and Grafana.

## Overview

The Unified Visibility Platform is a complete end-to-end solution for metrics collection and visualization:

### Key Features

- **User Authentication**: Secure signup and signin with JWT tokens
- **API Key Management**: Generate and manage API keys for metric authentication
- **Metric Configuration**: Define custom metrics with labels, types, and tracking events
- **Code Generation**: Automatically generate custom JavaScript tracking code
- **Automatic Tracking**: Generated code automatically tracks page views and custom events
- **Real-time Visualization**: View metrics in Grafana dashboards
- **Prometheus Integration**: Store metrics in Prometheus time-series database
- **Professional Dashboard**: Modern web interface for managing metrics

### How It Works

1. **User Signs Up**: Creates account and receives API credentials
2. **Configure Metrics**: User defines what metrics to track
3. **Generate Code**: System generates custom JavaScript code
4. **Embed Code**: User copies code to their website
5. **Automatic Tracking**: Code automatically sends metrics to the platform
6. **Visualization**: Metrics appear in Grafana dashboards

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              CLIENT WEBSITES                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Generated Tracking Code (JavaScript)             │  │
│  │  - Auto-tracks configured metrics                 │  │
│  │  - Sends metrics via HTTP POST                    │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                      │ HTTP POST /api/v1/metrics
                      │ Headers: X-API-Key, X-API-Secret
                      ▼
┌─────────────────────────────────────────────────────────┐
│              BACKEND API SERVER                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Express.js + PostgreSQL                         │  │
│  │  - Authentication (JWT)                          │  │
│  │  - API Key Management                             │  │
│  │  - Metric Configuration                           │  │
│  │  - Code Generation                                │  │
│  │  - Metrics Ingestion                             │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                      │ Push
                      ▼
┌─────────────────────────────────────────────────────────┐
│         PROMETHEUS PUSHGATEWAY → PROMETHEUS TSDB        │
└────────────────────┬────────────────────────────────────┘
                      │ Query
                      ▼
┌─────────────────────────────────────────────────────────┐
│              GRAFANA DASHBOARDS                         │
└─────────────────────────────────────────────────────────┘
                      ▲
                      │ Access
┌─────────────────────┴───────────────────────────────────┐
│              FRONTEND DASHBOARD                          │
│  - User Signup/Signin                                   │
│  - Metric Configuration                                  │
│  - Code Generation                                       │
│  - API Key Management                                    │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
unified_visibility_platform/
├── backend/              # Backend API Server
│   ├── src/
│   │   ├── api/
│   │   │   └── controllers/  # Request handlers
│   │   ├── config/           # Configuration
│   │   ├── middleware/       # Express middleware
│   │   ├── models/           # Sequelize models (User, ApiKey, MetricConfig)
│   │   ├── routes/           # Route definitions
│   │   ├── services/         # Business logic (Code Generator)
│   │   ├── tsdb/             # Prometheus integration
│   │   ├── utils/            # Utility functions
│   │   ├── app.js            # Express app setup
│   │   └── index.js          # Entry point
│   ├── clientlib/            # Generic client library
│   └── Dockerfile
├── frontend/                # Web Dashboard
│   ├── index.html           # Dashboard HTML
│   ├── styles.css           # Dashboard styles
│   └── app.js               # Dashboard JavaScript
├── docker/                  # Docker configurations
│   ├── prometheus/          # Prometheus config
│   └── grafana/            # Grafana config
├── docs/                    # Documentation
│   ├── SYSTEM_ARCHITECTURE.md  # System architecture
│   ├── USER_GUIDE.md           # User guide
│   └── DEVELOPER_GUIDE.md      # Developer guide
├── docker-compose.yml       # Docker Compose orchestration
└── env.template             # Environment variables template
```

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- PostgreSQL (or use Docker)
- Git

## Quick Start

1. Clone the repository:
```bash
git clone <repository-url>
cd unified_visibility_platform
```

2. Copy environment variables:
```bash
cp env.template .env
```

3. Start the services:
```bash
docker-compose up -d
```

4. Access the services:
- **Frontend Dashboard**: Open `frontend/index.html` in your browser (or serve via web server)
- **Backend API**: http://localhost:8000
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)
- **Pushgateway**: http://localhost:9091

5. Test the API:
```bash
curl http://localhost:8000/api/v1/health
```

## Quick Start Guide

### 1. Start the System

```bash
docker-compose up -d
cd backend && npm install && npm run dev
```

### 2. Access the Dashboard

Open `frontend/index.html` in your web browser (or serve it via a web server).

### 3. Create an Account

1. Click "Sign Up" tab
2. Fill in your details
3. **Save your API Key and Secret** when displayed!

### 4. Configure a Metric

1. Click "Create New Metric"
2. Fill in:
   - **Name**: "Page Views Tracker"
   - **Metric Name**: `page_views_total`
   - **Type**: Counter
   - Enable "Auto-track page views"
3. Click "Save"

### 5. Generate Code

1. Click "Generate Code" on your metric
2. Copy the generated JavaScript code
3. Paste it before `</body>` in your HTML

### 6. View Metrics

1. Visit your website (with the tracking code)
2. Open Grafana: http://localhost:3000
3. Create a dashboard to visualize your metrics

## Services

### Backend API
- **Port**: 8000
- **Purpose**: REST API for authentication, metric configuration, and metrics collection
- **Key Endpoints**: 
  - `POST /api/v1/auth/signup` - User registration
  - `POST /api/v1/auth/signin` - User login
  - `GET /api/v1/apikeys` - Manage API keys
  - `POST /api/v1/metric-configs` - Create metric configuration
  - `POST /api/v1/metric-configs/:id/generate-code` - Generate tracking code
  - `POST /api/v1/metrics` - Push metrics
  - `GET /api/v1/health` - Health check

### Frontend Dashboard
- **Location**: `frontend/`
- **Purpose**: Web interface for user management and metric configuration
- **Features**: Signup, signin, metric configuration, code generation

### PostgreSQL Database
- **Port**: 5432
- **Purpose**: Stores users, API keys, and metric configurations
- **Tables**: users, api_keys, metric_configs

### Prometheus Pushgateway
- **Port**: 9091
- **Purpose**: Receives pushed metrics from API
- **Endpoint**: `/metrics/job/{job}/instance/{instance}`

### Prometheus
- **Port**: 9090
- **Purpose**: Time Series Database for metrics storage
- **Configuration**: `docker/prometheus/prometheus.yml`

### Grafana
- **Port**: 3000
- **Purpose**: Metrics visualization and dashboards
- **Default Credentials**: admin/admin (change on first login)

## Usage Examples

### Using Generated Code (Recommended)

After configuring a metric and generating code, you'll get JavaScript like this:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Website</title>
</head>
<body>
    <!-- Your content -->
    
    <!-- Paste generated code here -->
    <script>
    (function() {
      // Auto-generated tracking code
      // Automatically tracks your configured metrics
    })();
    </script>
</body>
</html>
```

### Push Metrics via API (Advanced)

```bash
curl -X POST http://localhost:8000/api/v1/metrics \
  -H "Content-Type: application/json" \
  -H "X-API-Key: vp_your_api_key" \
  -H "X-API-Secret: vps_your_api_secret" \
  -d '{
    "metrics": [{
      "name": "page_views_total",
      "value": 1,
      "type": "counter",
      "labels": {
        "page": "/home"
      }
    }]
  }'
```

## Development

### Local Development

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm run dev
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Documentation

- **[System Architecture](docs/SYSTEM_ARCHITECTURE.md)** - Complete system architecture with diagrams
- **[User Guide](docs/USER_GUIDE.md)** - Step-by-step guide for users
- **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - Guide for developers extending the platform
- [API Documentation](docs/API.md) - Complete API reference
- [API Architecture](docs/API_ARCHITECTURE.md) - API architecture details
- [Backend README](backend/README.md) - Backend-specific documentation

## Configuration

Edit `.env` file for:
- API port and settings
- Prometheus Pushgateway URL
- CORS origins
- Rate limiting
- Logging configuration

See `env.template` for all available options.

## License

[To be specified]

## Support

For issues and questions, please open an issue in the repository.
