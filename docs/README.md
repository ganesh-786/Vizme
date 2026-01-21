# Metrics Tracker - MVP Documentation

## Overview

Metrics Tracker is a comprehensive metrics collection and visualization platform that allows users to:
- Configure custom metrics
- Generate tracking code for client websites
- Collect metrics via REST API
- Store metrics in Prometheus (TSDB)
- Visualize metrics in Grafana

## Table of Contents

1. [Architecture](#architecture)
2. [Setup Guide](#setup-guide)
3. [API Documentation](#api-documentation)
4. [User Flow](#user-flow)
5. [Deployment](#deployment)
6. [Security](#security)

## Architecture

### System Components

```
┌─────────────┐
│   Client    │ (Website with tracking code)
└──────┬──────┘
       │ HTTP POST /api/v1/metrics
       │ (X-API-Key header)
       ▼
┌─────────────┐
│   Backend   │ (Node.js + Express)
│   - Auth    │
│   - API     │
│   - Config  │
└──────┬──────┘
       │
       ├──► PostgreSQL (User data, configs, API keys)
       │
       └──► Prometheus Pushgateway
                  │
                  ▼
            ┌─────────────┐
            │ Prometheus  │ (TSDB)
            └──────┬──────┘
                   │
                   ▼
            ┌─────────────┐
            │   Grafana   │ (Visualization)
            └─────────────┘
```

### Technology Stack

**Backend:**
- Node.js 20+ with Express 5
- PostgreSQL 15 (User data, configurations)
- JWT for authentication
- bcryptjs for password hashing
- express-validator for input validation
- express-rate-limit for rate limiting

**Frontend:**
- React 18 with Vite
- React Router for routing
- Zustand for state management
- Axios for API calls

**Infrastructure:**
- Docker & Docker Compose
- Prometheus (Time-series database)
- Prometheus Pushgateway (Metrics ingestion)
- Grafana (Visualization)

### Data Flow

1. **User Registration/Login**: User creates account, receives JWT tokens
2. **Metric Configuration**: User defines metrics to track (name, type, labels)
3. **API Key Generation**: User generates API keys for authentication
4. **Code Generation**: System generates JavaScript tracking code with API key embedded
5. **Client Integration**: User copies code to their website
6. **Metric Ingestion**: Client website sends metrics to `/api/v1/metrics` endpoint
7. **Prometheus Storage**: Backend pushes metrics to Pushgateway → Prometheus
8. **Visualization**: Metrics are queried and displayed in Grafana

## Setup Guide

### Prerequisites

- Node.js 20+ and npm
- Docker and Docker Compose
- PostgreSQL 15+ (if not using Docker)

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration:
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=metrics_db
   DB_USER=postgres
   DB_PASSWORD=postgres
   JWT_SECRET=your-super-secret-jwt-key-min-32-chars
   PUSHGATEWAY_URL=http://localhost:9091
   GRAFANA_URL=http://localhost:3001
   ```

4. **Start the server:**
   ```bash
   npm start
   # or for development with auto-reload
   npm run dev
   ```

### Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   Create `.env` file:
   ```env
   VITE_API_BASE_URL=http://localhost:3000
   VITE_GRAFANA_URL=http://localhost:3001
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

### Docker Setup (Recommended)

1. **Start all services:**
   ```bash
   cd docker
   docker-compose up -d
   ```

   This will start:
   - PostgreSQL (port 5432)
   - Prometheus (port 9090)
   - Pushgateway (port 9091)
   - Grafana (port 3001)
   - Backend (port 3000)

2. **Check service status:**
   ```bash
   docker-compose ps
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f backend
   ```

4. **Stop services:**
   ```bash
   docker-compose down
   ```

### Database Initialization

The database tables are automatically created on first server start. The migration runs in `src/database/connection.js`.

**Manual migration (if needed):**
```bash
cd backend
npm run migrate
```

## API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <access_token>
```

### Endpoints

#### Authentication

**POST /auth/signup**
- **Description**: Register a new user
- **Rate Limit**: 5 requests/minute
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe" // optional
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": 1,
        "email": "user@example.com",
        "name": "John Doe"
      },
      "accessToken": "eyJ...",
      "refreshToken": "eyJ..."
    }
  }
  ```

**POST /auth/signin**
- **Description**: Sign in existing user
- **Rate Limit**: 5 requests/minute
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```

**POST /auth/refresh**
- **Description**: Refresh access token
- **Request Body:**
  ```json
  {
    "refreshToken": "eyJ..."
  }
  ```

#### API Keys

**GET /api-keys**
- **Description**: Get all API keys for authenticated user
- **Auth**: Required
- **Response:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "key_name": "Production Key",
        "api_key": "mk_...",
        "is_active": true,
        "created_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
  ```

**POST /api-keys**
- **Description**: Create new API key
- **Auth**: Required
- **Request Body:**
  ```json
  {
    "key_name": "Production Key"
  }
  ```

**PATCH /api-keys/:id**
- **Description**: Update API key (name or active status)
- **Auth**: Required
- **Request Body:**
  ```json
  {
    "key_name": "Updated Name", // optional
    "is_active": false // optional
  }
  ```

**DELETE /api-keys/:id**
- **Description**: Delete API key
- **Auth**: Required

#### Metric Configurations

**GET /metric-configs**
- **Description**: Get all metric configurations
- **Auth**: Required

**GET /metric-configs/:id**
- **Description**: Get single metric configuration
- **Auth**: Required

**POST /metric-configs**
- **Description**: Create metric configuration
- **Auth**: Required
- **Request Body:**
  ```json
  {
    "name": "User Clicks",
    "metric_name": "user_clicks_total",
    "metric_type": "counter",
    "description": "Total number of user clicks",
    "help_text": "Counter for tracking user clicks",
    "labels": [
      {"name": "page", "value": ""},
      {"name": "button", "value": ""}
    ]
  }
  ```
- **Metric Types**: `counter`, `gauge`, `histogram`, `summary`

**PATCH /metric-configs/:id**
- **Description**: Update metric configuration
- **Auth**: Required

**DELETE /metric-configs/:id**
- **Description**: Delete metric configuration
- **Auth**: Required

#### Code Generation

**POST /code-generation**
- **Description**: Generate tracking code snippet
- **Auth**: Required
- **Request Body:**
  ```json
  {
    "api_key_id": 1,
    "metric_config_id": 1, // optional, null for all configs
    "auto_track": true,
    "custom_events": true
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "code": "(function() { ... })();",
      "apiKeyId": 1,
      "metricConfigs": [...]
    }
  }
  ```

#### Metrics Ingestion

**POST /metrics**
- **Description**: Ingest metrics from client
- **Auth**: API Key (X-API-Key header)
- **Rate Limit**: 100 requests/minute per API key
- **Request Body:**
  ```json
  {
    "metrics": [
      {
        "name": "user_clicks_total",
        "type": "counter",
        "value": 1,
        "labels": {
          "page": "/home",
          "button": "signup"
        }
      }
    ]
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "processed": 1,
      "total": 1
    }
  }
  ```

#### Health Check

**GET /health**
- **Description**: Health check endpoint
- **Auth**: Not required
- **Response:**
  ```json
  {
    "success": true,
    "status": "healthy",
    "timestamp": "2024-01-01T00:00:00Z",
    "uptime": 3600
  }
  ```

## User Flow

### 1. Registration and Login
- User visits the website
- User signs up with email and password
- System creates account and returns JWT tokens
- User is redirected to dashboard

### 2. Metric Configuration
- User navigates to "Metric Configurations"
- User creates a new metric configuration:
  - Name: "User Clicks"
  - Metric Name: "user_clicks_total" (Prometheus format)
  - Type: Counter
  - Optional: Description, Help text, Labels
- System validates and stores configuration

### 3. API Key Generation
- User navigates to "API Keys"
- User creates a new API key with a name
- System generates unique API key (format: `mk_...`)
- **Important**: Key is shown only once - user must copy it

### 4. Code Generation
- User navigates to "Code Generation"
- User selects:
  - API Key
  - Metric Configuration (or all)
  - Options (auto-tracking, custom events)
- System generates JavaScript code snippet
- User copies code

### 5. Client Integration
- User pastes code before `</body>` tag in their website
- Code automatically initializes and starts tracking

### 6. Metric Collection
- Client website sends metrics to `/api/v1/metrics` endpoint
- Backend validates and pushes to Prometheus Pushgateway
- Prometheus scrapes from Pushgateway and stores metrics

### 7. Visualization
- User opens Grafana (http://localhost:3001)
- User queries Prometheus for metrics
- User creates dashboards and visualizations

## Deployment

### Production Considerations

1. **Environment Variables:**
   - Use strong `JWT_SECRET` (minimum 32 characters)
   - Use secure database credentials
   - Configure proper CORS origins
   - Set `NODE_ENV=production`

2. **Database:**
   - Use managed PostgreSQL service
   - Enable SSL connections
   - Set up regular backups
   - Configure connection pooling

3. **Security:**
   - Enable HTTPS
   - Use secure cookie settings
   - Implement proper rate limiting
   - Monitor for suspicious activity
   - Regular security updates

4. **Monitoring:**
   - Set up application monitoring (e.g., PM2, New Relic)
   - Monitor Prometheus metrics
   - Set up alerting in Grafana
   - Log aggregation (e.g., ELK stack)

5. **Scaling:**
   - Use load balancer for multiple backend instances
   - Configure Prometheus for high availability
   - Use Redis for session storage (if needed)
   - Implement database read replicas

### Docker Production Deployment

1. **Build images:**
   ```bash
   docker-compose build
   ```

2. **Use environment file:**
   ```bash
   docker-compose --env-file .env.production up -d
   ```

3. **Use reverse proxy (nginx):**
   - Configure nginx for SSL termination
   - Route traffic to backend and frontend
   - Set up proper headers

## Security

### Authentication
- Passwords hashed with bcrypt (12 rounds)
- JWT tokens with short expiration (15min access, 7d refresh)
- Refresh token rotation on use
- Rate limiting on auth endpoints (5 req/min)

### API Security
- API key authentication for metrics endpoint
- Rate limiting (100 req/min per API key)
- Input validation and sanitization
- CORS configuration
- Helmet.js for security headers

### Data Protection
- SQL injection prevention (parameterized queries)
- XSS prevention (input sanitization)
- HTTPS in production
- Secure password requirements (min 8 chars)

## Troubleshooting

### Backend won't start
- Check PostgreSQL is running
- Verify environment variables
- Check port 3000 is available
- Review error logs

### Database connection errors
- Verify database credentials
- Check PostgreSQL is accessible
- Ensure database exists
- Check network connectivity

### Metrics not appearing in Grafana
- Verify Prometheus is scraping Pushgateway
- Check Pushgateway is receiving metrics
- Verify metric names match queries
- Check Grafana datasource configuration

### Frontend can't connect to backend
- Verify backend is running
- Check CORS configuration
- Verify API base URL in frontend .env
- Check browser console for errors

## Support

For issues or questions, please refer to the project repository or contact the development team.
