# Unified Visibility Platform - System Architecture

## Overview

The Unified Visibility Platform is a comprehensive metrics visualization system that allows clients to sign up, configure custom metrics, generate embeddable tracking code, and visualize their metrics in real-time through Prometheus and Grafana.

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT WEBSITES                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Generated Tracking Code (JavaScript)                     │  │
│  │  - Auto-tracks configured metrics                         │  │
│  │  - Sends metrics via HTTP POST                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP POST
                             │ /api/v1/metrics
                             │ Headers: X-API-Key, X-API-Secret
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API SERVER                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Express.js Application                                   │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   Auth API   │  │ Metrics API  │  │ Config API   │   │  │
│  │  │ - Signup     │  │ - Push       │  │ - CRUD       │   │  │
│  │  │ - Signin     │  │ - Validate   │  │ - Generate   │   │  │
│  │  │ - JWT        │  │ - Authorize  │  │   Code       │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                    │
│                             │ Store                              │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL Database                                     │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐           │  │
│  │  │  Users   │  │ API Keys │  │ Metric Config│           │  │
│  │  └──────────┘  └──────────┘  └──────────────┘           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                    │
│                             │ Push                               │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Prometheus Pushgateway                                   │  │
│  │  - Receives metrics via HTTP PUT                          │  │
│  │  - Temporarily stores metrics                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Scrape
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PROMETHEUS TSDB                             │
│  - Time-series database                                          │
│  - Stores metrics long-term                                      │
│  - Provides query API (PromQL)                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │ Query
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GRAFANA                                     │
│  - Visualization dashboards                                      │
│  - Real-time metric graphs                                       │
│  - Alerting                                                      │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Access
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND DASHBOARD                            │
│  - User signup/signin                                            │
│  - Metric configuration                                          │
│  - Code generation                                               │
│  - API key management                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Frontend Dashboard

**Location:** `/frontend/`

**Technologies:**
- HTML5
- CSS3 (Modern styling with gradients)
- Vanilla JavaScript (No framework dependencies)

**Features:**
- User authentication (Sign up/Sign in)
- API key management
- Metric configuration forms
- Code generation and display
- Link to Grafana visualizations

**Key Files:**
- `index.html` - Main dashboard interface
- `styles.css` - Styling and layout
- `app.js` - Application logic and API interactions

### 2. Backend API Server

**Location:** `/backend/src/`

**Technologies:**
- Node.js
- Express.js
- Sequelize ORM
- PostgreSQL
- JWT for authentication
- bcryptjs for password hashing

**Key Components:**

#### 2.1 Authentication System
- **Signup:** Creates user account and default API key
- **Signin:** Validates credentials and returns JWT token
- **JWT Middleware:** Validates tokens for protected routes

#### 2.2 API Key Management
- Each user can create multiple API keys
- API keys authenticate metric submissions
- Keys include both `apiKey` and `apiSecret` for security

#### 2.3 Metric Configuration
- Users define metrics they want to track
- Configuration includes:
  - Metric name (Prometheus format)
  - Metric type (counter, gauge, histogram, summary)
  - Labels (key-value pairs)
  - Auto-tracking settings
  - Custom event tracking

#### 2.4 Code Generation Service
- Generates custom JavaScript code based on metric configuration
- Code includes:
  - API endpoint configuration
  - Metric tracking logic
  - Auto-tracking for page views
  - Custom event handlers
  - Batch processing and flushing

#### 2.5 Metrics Ingestion
- Receives metrics from client websites
- Validates API keys (optional but recommended)
- Validates metric format
- Pushes to Prometheus Pushgateway

### 3. Database Schema

**PostgreSQL Database**

#### Users Table
```sql
- id (UUID, Primary Key)
- email (String, Unique)
- password (String, Hashed)
- first_name (String)
- last_name (String)
- is_active (Boolean)
- last_login_at (Timestamp)
- created_at (Timestamp)
- updated_at (Timestamp)
```

#### API Keys Table
```sql
- id (UUID, Primary Key)
- user_id (UUID, Foreign Key -> Users)
- key_name (String)
- api_key (String, Unique)
- api_secret (String)
- is_active (Boolean)
- last_used_at (Timestamp)
- expires_at (Timestamp, Nullable)
- created_at (Timestamp)
- updated_at (Timestamp)
```

#### Metric Configs Table
```sql
- id (UUID, Primary Key)
- user_id (UUID, Foreign Key -> Users)
- name (String)
- description (Text, Nullable)
- metric_name (String)
- metric_type (Enum: counter, gauge, histogram, summary)
- labels (JSONB)
- auto_track (Boolean)
- tracking_events (Array of Strings)
- is_active (Boolean)
- created_at (Timestamp)
- updated_at (Timestamp)
```

### 4. Prometheus Stack

**Components:**
- **Prometheus Pushgateway:** Receives metrics via HTTP PUT
- **Prometheus:** Scrapes Pushgateway and stores metrics
- **Grafana:** Visualizes metrics from Prometheus

**Configuration:**
- Prometheus scrapes Pushgateway every 15 seconds
- Metrics retention: 30 days (configurable)
- Grafana pre-configured with Prometheus datasource

## Data Flow

### 1. User Registration Flow

```
User → Frontend Dashboard
  → POST /api/v1/auth/signup
  → Backend creates User record
  → Backend creates default API Key
  → Returns JWT token + API credentials
  → User can now configure metrics
```

### 2. Metric Configuration Flow

```
User → Frontend Dashboard
  → POST /api/v1/metric-configs
  → Backend stores MetricConfig
  → User clicks "Generate Code"
  → POST /api/v1/metric-configs/:id/generate-code
  → Code Generator Service creates custom JavaScript
  → Returns generated code
  → User copies code to their website
```

### 3. Metric Tracking Flow

```
Client Website (with generated code)
  → JavaScript tracks events/metrics
  → Batches metrics in memory
  → Flushes to API every 5 seconds or on batch size
  → POST /api/v1/metrics
    Headers: X-API-Key, X-API-Secret
  → Backend validates API key
  → Backend validates metric format
  → Backend pushes to Prometheus Pushgateway
  → Prometheus scrapes Pushgateway
  → Metrics stored in Prometheus TSDB
  → Grafana queries Prometheus
  → Visualizations displayed
```

## Security Features

1. **Password Hashing:** bcryptjs with configurable rounds
2. **JWT Authentication:** Secure token-based auth for API access
3. **API Key Authentication:** Dual-key system (key + secret)
4. **Rate Limiting:** Prevents abuse on metrics endpoint
5. **Input Validation:** Express-validator on all endpoints
6. **CORS Configuration:** Configurable allowed origins
7. **Helmet.js:** Security headers

## API Endpoints

### Authentication
- `POST /api/v1/auth/signup` - User registration
- `POST /api/v1/auth/signin` - User login
- `GET /api/v1/auth/me` - Get current user profile

### API Keys
- `POST /api/v1/apikeys` - Create new API key
- `GET /api/v1/apikeys` - List user's API keys
- `DELETE /api/v1/apikeys/:id` - Delete API key

### Metric Configurations
- `POST /api/v1/metric-configs` - Create metric configuration
- `GET /api/v1/metric-configs` - List user's configurations
- `GET /api/v1/metric-configs/:id` - Get single configuration
- `PUT /api/v1/metric-configs/:id` - Update configuration
- `DELETE /api/v1/metric-configs/:id` - Delete configuration
- `POST /api/v1/metric-configs/:id/generate-code` - Generate tracking code

### Metrics
- `POST /api/v1/metrics` - Push metrics to Prometheus

### Health & Client Library
- `GET /api/v1/health` - Health check
- `GET /api/v1/client/script.js` - Generic client library
- `GET /api/v1/client` - Client library info

## Deployment

### Docker Compose Services

1. **PostgreSQL:** Database server
2. **Backend API:** Node.js application
3. **Prometheus Pushgateway:** Metrics receiver
4. **Prometheus:** Time-series database
5. **Grafana:** Visualization platform

### Environment Variables

See `env.template` for all required environment variables.

## Scalability Considerations

1. **Database:** Can be scaled with read replicas
2. **API Server:** Stateless, can be horizontally scaled
3. **Prometheus:** Can be federated for large-scale deployments
4. **Pushgateway:** Can be load-balanced

## Monitoring & Observability

- Application logs via Winston
- Health check endpoint
- Prometheus metrics on application itself
- Error tracking and logging

