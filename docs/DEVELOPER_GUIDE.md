# Unified Visibility Platform - Developer Guide

## Project Structure

```
unified_visibility_platform/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   └── controllers/      # Request handlers
│   │   ├── config/               # Configuration files
│   │   ├── middleware/           # Express middleware
│   │   ├── models/               # Sequelize models
│   │   ├── routes/               # Route definitions
│   │   ├── services/             # Business logic services
│   │   ├── tsdb/                 # Time-series DB integration
│   │   ├── utils/                # Utility functions
│   │   ├── app.js                # Express app setup
│   │   └── index.js              # Application entry point
│   ├── clientlib/                # Client library files
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── index.html                # Dashboard HTML
│   ├── styles.css                # Dashboard styles
│   └── app.js                    # Dashboard JavaScript
├── docker/
│   ├── grafana/                  # Grafana configuration
│   └── prometheus/               # Prometheus configuration
├── docs/                         # Documentation
├── docker-compose.yml            # Docker services
└── env.template                  # Environment variables template
```

## Setup & Installation

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- PostgreSQL (or use Docker)

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd unified_visibility_platform
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp ../env.template ../.env
   # Edit .env with your configuration
   ```

4. **Start services with Docker Compose**
   ```bash
   cd ..
   docker-compose up -d
   ```

5. **Run database migrations** (if using migrations)
   ```bash
   cd backend
   npm run migrate  # If you add migrations
   ```

6. **Start backend server**
   ```bash
   npm run dev
   ```

7. **Access the application**
   - Frontend Dashboard: `http://localhost:8000` (if served)
   - Backend API: `http://localhost:8000/api/v1`
   - Grafana: `http://localhost:3000`
   - Prometheus: `http://localhost:9090`
   - Pushgateway: `http://localhost:9091`

## Architecture Overview

### Backend Architecture

```
┌─────────────────────────────────────────┐
│         Express Application              │
│                                         │
│  ┌─────────────┐  ┌─────────────┐    │
│  │  Routes      │→ │ Controllers  │    │
│  └─────────────┘  └─────────────┘    │
│         │                │             │
│         │                ▼             │
│         │         ┌─────────────┐     │
│         │         │  Services   │     │
│         │         └─────────────┘     │
│         │                │             │
│         │                ▼             │
│         │         ┌─────────────┐     │
│         └────────→│  Models     │     │
│                   └─────────────┘     │
└───────────────────┬───────────────────┘
                    │
                    ▼
            ┌───────────────┐
            │  PostgreSQL   │
            └───────────────┘
```

### Key Components

#### 1. Models (`/backend/src/models/`)

**User Model:**
- Stores user account information
- Handles password hashing via bcrypt
- Provides authentication methods

**ApiKey Model:**
- Manages API keys for metric authentication
- Generates secure keys and secrets
- Tracks usage

**MetricConfig Model:**
- Stores user-defined metric configurations
- Links to users
- Contains metric metadata

#### 2. Controllers (`/backend/src/api/controllers/`)

**auth.controller.js:**
- Handles user signup/signin
- Generates JWT tokens
- Manages user sessions

**apikey.controller.js:**
- Creates, lists, and deletes API keys
- Manages key lifecycle

**metricconfig.controller.js:**
- CRUD operations for metric configurations
- Generates tracking code

**metrics.controller.js:**
- Receives metrics from clients
- Validates and processes metrics
- Pushes to Prometheus

#### 3. Services (`/backend/src/services/`)

**codeGenerator.service.js:**
- Generates custom JavaScript tracking code
- Customizes code based on metric configuration
- Includes auto-tracking and event handlers

#### 4. Middleware (`/backend/src/middleware/`)

**auth.middleware.js:**
- Validates JWT tokens
- Validates API keys
- Attaches user context to requests

**rateLimiter.middleware.js:**
- Prevents API abuse
- Configurable rate limits

**errorHandler.middleware.js:**
- Centralized error handling
- Formats error responses

## API Development

### Adding a New Endpoint

1. **Create Controller Method**
   ```javascript
   // backend/src/api/controllers/example.controller.js
   class ExampleController {
     async getExample(req, res, next) {
       try {
         // Your logic here
         res.json({ success: true, data: {} });
       } catch (error) {
         next(error);
       }
     }
   }
   module.exports = new ExampleController();
   ```

2. **Create Route**
   ```javascript
   // backend/src/routes/example.routes.js
   const express = require('express');
   const exampleController = require('../api/controllers/example.controller');
   const { authenticateToken } = require('../middleware/auth.middleware');
   
   const router = express.Router();
   router.get('/', authenticateToken, exampleController.getExample);
   module.exports = router;
   ```

3. **Register Route in app.js**
   ```javascript
   const exampleRoutes = require('./routes/example.routes');
   app.use('/api/v1/example', exampleRoutes);
   ```

### Adding a New Model

1. **Create Model File**
   ```javascript
   // backend/src/models/Example.js
   const { DataTypes } = require('sequelize');
   const sequelize = require('../config/database');
   
   const Example = sequelize.define('Example', {
     id: {
       type: DataTypes.UUID,
       defaultValue: DataTypes.UUIDV4,
       primaryKey: true
     },
     // Add fields
   }, {
     tableName: 'examples'
   });
   
   module.exports = Example;
   ```

2. **Register in models/index.js**
   ```javascript
   const Example = require('./Example');
   
   // Define relationships
   User.hasMany(Example, { foreignKey: 'userId', as: 'examples' });
   Example.belongsTo(User, { foreignKey: 'userId', as: 'user' });
   ```

## Database Migrations

Currently, the system uses `sequelize.sync()` for development. For production, use migrations:

```bash
# Install Sequelize CLI
npm install -g sequelize-cli

# Create migration
sequelize migration:generate --name create-examples-table

# Run migrations
sequelize db:migrate
```

## Testing

### Running Tests

```bash
cd backend
npm test
```

### Writing Tests

```javascript
// backend/tests/example.test.js
const request = require('supertest');
const app = require('../src/app');

describe('Example API', () => {
  it('should return 200', async () => {
    const res = await request(app)
      .get('/api/v1/example')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.statusCode).toEqual(200);
  });
});
```

## Code Generation Service

### How It Works

1. **Input:** Metric configuration + API credentials
2. **Process:**
   - Reads metric configuration
   - Generates JavaScript template
   - Injects configuration values
   - Adds tracking logic based on events
3. **Output:** Complete JavaScript code ready to embed

### Customizing Generated Code

Edit `/backend/src/services/codeGenerator.service.js`:

```javascript
generateClientCode({ metricConfig, apiKey, apiSecret, apiUrl }) {
  // Customize the template
  const code = `...`;
  return code;
}
```

## Security Considerations

### 1. Password Security
- Passwords are hashed with bcrypt (10 rounds default)
- Never store plain text passwords
- Use strong password requirements

### 2. API Key Security
- API keys are generated using crypto.randomBytes
- Secrets are only shown once during creation
- Keys can be revoked/deleted

### 3. JWT Security
- Tokens expire after 7 days (configurable)
- Secret key must be strong (32+ characters)
- Tokens are validated on every request

### 4. Input Validation
- All inputs validated with express-validator
- SQL injection prevented by Sequelize
- XSS prevented by proper escaping

## Performance Optimization

### 1. Database Indexing
- Index on frequently queried fields
- Foreign keys automatically indexed
- Composite indexes for complex queries

### 2. Caching
- Consider Redis for session storage
- Cache frequently accessed data
- Cache API responses where appropriate

### 3. Rate Limiting
- Already implemented on metrics endpoint
- Adjust limits based on usage
- Consider per-user rate limits

## Monitoring & Logging

### Logging

Uses Winston logger:
```javascript
const logger = require('./utils/logger');
logger.info('Message', { metadata });
logger.error('Error', { error, stack });
```

### Health Checks

Health endpoint: `GET /api/v1/health`

### Metrics

Application metrics can be exposed at `/metrics` endpoint for Prometheus scraping.

## Deployment

### Docker Deployment

1. **Build images:**
   ```bash
   docker-compose build
   ```

2. **Start services:**
   ```bash
   docker-compose up -d
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f backend
   ```

### Production Considerations

1. **Environment Variables:**
   - Set strong JWT_SECRET
   - Configure database credentials
   - Set CORS origins properly

2. **Database:**
   - Use managed PostgreSQL service
   - Enable backups
   - Configure connection pooling

3. **Security:**
   - Use HTTPS
   - Enable rate limiting
   - Monitor for abuse
   - Regular security updates

4. **Scaling:**
   - Use load balancer
   - Scale backend horizontally
   - Use read replicas for database

## Troubleshooting

### Database Connection Issues

```bash
# Check database is running
docker-compose ps postgres

# Check connection
docker-compose exec backend node -e "require('./src/models').sequelize.authenticate()"
```

### API Not Responding

```bash
# Check logs
docker-compose logs backend

# Check health
curl http://localhost:8000/api/v1/health
```

### Metrics Not Reaching Prometheus

1. Check Pushgateway: `http://localhost:9091`
2. Check Prometheus targets: `http://localhost:9090/targets`
3. Check backend logs for push errors

## Contributing

1. Follow existing code style
2. Add tests for new features
3. Update documentation
4. Use meaningful commit messages
5. Create pull requests for review

## Resources

- [Express.js Documentation](https://expressjs.com/)
- [Sequelize Documentation](https://sequelize.org/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)

