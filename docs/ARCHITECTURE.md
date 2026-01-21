# Architecture Documentation

## System Architecture

### High-Level Overview

The Metrics Tracker MVP is built as a microservices-oriented architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  ┌──────────────┐              ┌──────────────┐            │
│  │   Web App    │              │ Client Sites │            │
│  │  (React)     │              │ (Tracking    │            │
│  │              │              │  Code)       │            │
│  └──────┬───────┘              └──────┬───────┘            │
└─────────┼─────────────────────────────┼────────────────────┘
          │                             │
          │ HTTP/REST                   │ HTTP/REST
          │ JWT Auth                    │ API Key Auth
          ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Backend API (Node.js/Express)           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │   Auth   │  │  Config  │  │  Metrics │          │   │
│  │  │  Module  │  │  Module  │  │  Module  │          │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
│  │  ┌──────────┐  ┌──────────────────────────┐        │   │
│  │  │  Tracker │  │  Prometheus Registry     │        │   │
│  │  │  Module  │  │  (prom-client)           │        │   │
│  │  └──────────┘  └──────────┬───────────────┘        │   │
│  └────────────────────────────┼─────────────────────────┘   │
└─────────┬─────────────────────┼─────────────────────────────┘
          │                     │
          │                     │ /metrics endpoint
          ▼                     ▼
┌──────────────────────┐  ┌──────────────────────────┐
│   Data Layer         │  │   Metrics Layer          │
│                      │  │                          │
│  ┌──────────────┐   │  │  ┌────────────────────┐  │
│  │  PostgreSQL  │   │  │  │   Prometheus      │  │
│  │              │   │  │  │   (Scrapes /metrics│  │
│  │  - Users     │   │  │  │   from Backend)    │  │
│  │  - API Keys  │   │  │  └────────┬───────────┘  │
│  │  - Configs   │   │  │           │              │
│  └──────────────┘   │  │           ▼              │
│                     │  │  ┌────────────────────┐  │
│                     │  │  │     Grafana        │  │
│                     │  │  │  (Visualization)   │  │
│                     │  │  └────────────────────┘  │
└─────────────────────┘  └──────────────────────────┘
```

## Component Details

### 1. Frontend (React Application)

**Technology**: React 18 + Vite

**Responsibilities**:
- User authentication UI
- Metric configuration management
- API key management
- Code generation interface
- Dashboard and statistics

**Key Features**:
- Client-side routing (React Router)
- State management (Zustand)
- API client with token refresh
- Responsive UI/UX

**File Structure**:
```
frontend/
├── src/
│   ├── api/          # API client functions
│   ├── components/   # Reusable components
│   ├── pages/        # Page components
│   ├── store/        # State management
│   └── App.jsx       # Main app component
```

### 2. Backend API (Node.js/Express)

**Technology**: Node.js 20 + Express 5

**Responsibilities**:
- Authentication and authorization
- User management
- API key management
- Metric configuration CRUD
- Code generation
- Metrics ingestion
- Prometheus integration

**Architecture Pattern**: RESTful API with middleware-based architecture

**File Structure**:
```
backend/
├── src/
│   ├── database/     # Database connection & migrations
│   ├── middleware/   # Auth, rate limiting, error handling
│   ├── routes/        # API route handlers
│   ├── services/      # Business logic (code generation)
│   └── ...
└── index.js          # Application entry point
```

**Key Modules**:

1. **Authentication Module**
   - JWT-based authentication
   - Password hashing (bcrypt)
   - Token refresh mechanism
   - Session management

2. **API Key Module**
   - Generation and management
   - Validation middleware
   - Rate limiting per key

3. **Metric Configuration Module**
   - CRUD operations
   - Validation (Prometheus format)
   - User-scoped access

4. **Code Generation Module**
   - Minimal snippet generation (~150 bytes)
   - Dynamic library loading via tracker.js endpoint
   - API key embedding
   - Customizable options (auto-track, custom events)

5. **Tracker Module**
   - Dynamic JavaScript library generation
   - API key validation
   - User metric configuration fetching
   - Browser caching optimization
   - CORS support for cross-origin loading

6. **Metrics Ingestion Module**
   - REST endpoint (`/api/v1/metrics`)
   - API key authentication
   - Batch processing (up to 100 metrics per request)
   - Direct Prometheus registry integration (prom-client)
   - In-memory metric storage
   - Prometheus scraping endpoint (`/metrics`)

**Key API Endpoints**:

- `GET /api/v1/tracker.js` - Dynamic tracking library generator
  - Query params: `k` (API key), `a` (auto-track), `c` (custom events)
  - Returns: Full JavaScript tracking library
  - CORS enabled for cross-origin loading
  - Browser caching (1 hour)

- `POST /api/v1/metrics` - Metrics ingestion endpoint
  - Headers: `X-API-Key` (required)
  - Body: Array of metrics (name, type, value, labels)
  - Returns: Processing results with error details

- `GET /metrics` - Prometheus scraping endpoint
  - No authentication (Prometheus needs access)
  - Returns: Prometheus text format metrics
  - Scraped by Prometheus server

- `POST /api/v1/code-generation` - Generate tracking snippet
  - Auth: JWT required
  - Returns: Minimal snippet (~150 bytes) that loads tracker.js

### 3. Database (PostgreSQL)

**Schema Design**:

**Users Table**:
- `id` (SERIAL PRIMARY KEY)
- `email` (VARCHAR, UNIQUE)
- `password_hash` (VARCHAR)
- `name` (VARCHAR, nullable)
- `created_at`, `updated_at` (TIMESTAMP)

**Refresh Tokens Table**:
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER, FK to users)
- `token` (VARCHAR, UNIQUE)
- `expires_at` (TIMESTAMP)
- `created_at` (TIMESTAMP)

**API Keys Table**:
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER, FK to users)
- `key_name` (VARCHAR)
- `api_key` (VARCHAR, UNIQUE)
- `is_active` (BOOLEAN)
- `created_at`, `updated_at` (TIMESTAMP)

**Metric Configs Table**:
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER, FK to users)
- `name` (VARCHAR)
- `description` (TEXT, nullable)
- `metric_type` (VARCHAR, CHECK constraint)
- `metric_name` (VARCHAR, UNIQUE per user)
- `labels` (JSONB)
- `help_text` (TEXT, nullable)
- `created_at`, `updated_at` (TIMESTAMP)

**Indexes**:
- Email lookup (users)
- Token lookup (refresh_tokens)
- API key lookup (api_keys)
- User-scoped queries (metric_configs)

### 4. Metrics Infrastructure

**Backend Metrics Service (prom-client)**:
- In-memory Prometheus registry
- Stores metrics with user_id labels for multi-tenancy
- Supports Counter, Gauge, Histogram, and Summary metric types
- Exposes `/metrics` endpoint in Prometheus text format
- Automatic metric instance management
- Default labels for application identification

**Prometheus**:
- Time-series database
- Scrapes metrics directly from backend `/metrics` endpoint
- Stores metrics long-term (30-day retention)
- Query language (PromQL)
- No Pushgateway dependency (direct scraping)

**Grafana**:
- Visualization platform
- Connects to Prometheus datasource
- Pre-configured dashboards
- Query builder interface
- Multi-tenant metric filtering by user_id

## Data Flow

### Authentication Flow

```
1. User submits credentials
   ↓
2. Backend validates and hashes password
   ↓
3. Backend generates JWT tokens (access + refresh)
   ↓
4. Backend stores refresh token in database
   ↓
5. Frontend stores tokens in localStorage
   ↓
6. Frontend includes access token in API requests
   ↓
7. Backend validates token on each request
   ↓
8. On token expiry, frontend uses refresh token
   ↓
9. Backend issues new access token
```

### Metric Collection Flow

```
1. Client website loads minimal tracking snippet (~150 bytes)
   ↓
2. Snippet asynchronously loads full library from /api/v1/tracker.js
   ↓
3. Tracker.js endpoint validates API key and fetches user's metric configs
   ↓
4. Full tracking library is generated dynamically and served
   ↓
5. Library initializes with API key, endpoint, and metric configurations
   ↓
6. Library tracks events (auto or custom)
   ↓
7. Library batches metrics (10 per batch or 5s timeout)
   ↓
8. Library sends POST to /api/v1/metrics with API key in header
   ↓
9. Backend validates API key
   ↓
10. Backend validates metrics format
    ↓
11. Backend records metrics in Prometheus registry (prom-client)
    ↓
12. Prometheus scrapes /metrics endpoint from backend
    ↓
13. Metrics stored in Prometheus TSDB
    ↓
14. Grafana queries Prometheus
    ↓
15. User views metrics in Grafana (filtered by user_id)
```

### Code Generation Flow

```
1. User selects API key and metric configs in web app
   ↓
2. Backend fetches configs from database
   ↓
3. Backend generates minimal tracking snippet (~150 bytes)
   ↓
4. Snippet includes API key and options (auto-track, custom events)
   ↓
5. Snippet contains URL to /api/v1/tracker.js endpoint
   ↓
6. Backend returns minimal snippet to frontend
   ↓
7. User copies snippet to clipboard
   ↓
8. User pastes snippet in website HTML
   ↓
9. When page loads, snippet loads full library from tracker.js
   ↓
10. Tracker.js dynamically generates library with user's metric configs
    ↓
11. Library is cached by browser (1 hour cache)
```

## Security Architecture

### Authentication & Authorization

1. **Password Security**:
   - bcrypt with 12 rounds
   - Minimum 8 characters
   - No password storage in plain text

2. **Token Security**:
   - Short-lived access tokens (15min)
   - Longer refresh tokens (7 days)
   - Token rotation on refresh
   - Secure storage in localStorage

3. **API Key Security**:
   - Cryptographically secure generation
   - One-time display
   - Active/inactive status
   - Per-key rate limiting

### Input Validation

- **Backend**: express-validator
- **Frontend**: HTML5 validation + custom validation
- **Database**: Constraints and checks
- **Sanitization**: Input sanitization on all user inputs

### Rate Limiting

- **Auth endpoints**: 5 requests/minute
- **Metrics endpoint**: 100 requests/minute per API key
- **General API**: 100 requests/minute

### Network Security

- CORS configuration
- Helmet.js security headers
- HTTPS in production (recommended)
- API key in headers (not URL)

## Scalability Considerations

### Current MVP Limitations

- Single backend instance
- Single PostgreSQL instance
- No caching layer
- No message queue
- Synchronous metric processing

### Future Scalability Options

1. **Horizontal Scaling**:
   - Load balancer (nginx/HAProxy)
   - Multiple backend instances
   - Stateless JWT authentication

2. **Database Scaling**:
   - Read replicas
   - Connection pooling
   - Query optimization

3. **Metrics Scaling**:
   - Prometheus federation
   - Multiple backend instances with shared registry
   - Metric aggregation
   - Consider Pushgateway for ephemeral jobs (future)

4. **Caching**:
   - Redis for session storage
   - Cache metric configs
   - Cache API key lookups

5. **Async Processing**:
   - Message queue (RabbitMQ/Kafka)
   - Background workers
   - Batch processing

## Monitoring & Observability

### Application Monitoring

- Health check endpoint (`/health`)
- Request logging (morgan)
- Error logging
- Database query logging

### Metrics Monitoring

- Prometheus metrics exposed at `/metrics` endpoint
- Direct Prometheus scraping (no Pushgateway)
- Grafana dashboards with user_id filtering
- Alert rules (future)
- In-memory metric registry (prom-client)

### Logging

- Structured logging (JSON format)
- Log levels (info, warn, error)
- Request/response logging
- Error stack traces

## Deployment Architecture

### Development

```
Local Machine
├── Frontend (Vite dev server :5173)
├── Backend (Node.js :3000)
│   ├── /api/v1/* (REST API)
│   ├── /api/v1/tracker.js (Dynamic library)
│   └── /metrics (Prometheus scraping)
└── Docker Compose
    ├── PostgreSQL (:5432)
    ├── Prometheus (:9090)
    └── Grafana (:3001)
```

### Production (Recommended)

```
Internet
  ↓
Load Balancer (nginx/HAProxy)
  ├── Frontend (Static files/CDN)
  └── Backend (Multiple instances)
      ├── PostgreSQL (Primary + Replicas)
      └── Prometheus Stack
          ├── Prometheus (Scrapes backend /metrics)
          └── Grafana
```

## Error Handling

### Backend Error Handling

- Centralized error handler middleware
- Custom error classes
- HTTP status codes
- Error messages (sanitized in production)
- Stack traces (development only)

### Frontend Error Handling

- Try-catch in API calls
- Error boundaries (React)
- User-friendly error messages
- Retry logic for failed requests

## Testing Strategy (Future)

### Unit Tests
- Service functions
- Utility functions
- Validation logic

### Integration Tests
- API endpoints
- Database operations
- Authentication flow

### E2E Tests
- User workflows
- Metric collection
- Code generation

## Performance Optimization

### Current Optimizations

- Database indexes
- Connection pooling
- Batch metric processing (client-side: 10 metrics or 5s timeout)
- Client-side batching and retry logic
- Browser caching for tracker.js (1 hour)
- Minimal tracking snippet (~150 bytes)
- Dynamic library generation (reduces initial payload)
- In-memory Prometheus registry (fast metric recording)

### Future Optimizations

- Database query optimization
- Caching layer
- CDN for static assets
- Compression (gzip)
- Database query result caching
