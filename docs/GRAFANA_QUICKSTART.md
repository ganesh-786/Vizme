# Grafana Integration - Quick Start Guide

## Prerequisites

- Docker and Docker Compose installed
- Backend and Frontend dependencies installed

## Step 1: Start Docker Services

```bash
cd docker
docker-compose up -d
```

This will start:
- PostgreSQL (port 5432)
- Prometheus (port 9090)
- Pushgateway (port 9091)
- Grafana (port 3001)

## Step 2: Verify Services

### Check all services are running:
```bash
docker-compose ps
```

All services should show "Up" status.

### Verify Grafana is accessible:
```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "database": "ok",
  "version": "10.x.x"
}
```

### Verify Prometheus is accessible:
```bash
curl http://localhost:9090/-/healthy
```

### Verify Pushgateway is accessible:
```bash
curl http://localhost:9091/metrics
```

## Step 3: Access Grafana

1. Open browser: `http://localhost:3001`
2. Login with:
   - Username: `admin`
   - Password: `admin`
3. Navigate to Dashboards → Browse
4. You should see "Unified Visibility Platform - Metrics Dashboard"

## Step 4: Test Metric Flow

### 4.1: Start Backend
```bash
cd backend
npm install
npm start
```

### 4.2: Create API Key (via Frontend or API)

Via API:
```bash
# First, sign up or login to get JWT token
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'

# Then create API key (use the accessToken from above)
curl -X POST http://localhost:3000/api/v1/api-keys \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key_name": "Test Key"}'
```

### 4.3: Send Test Metric

```bash
curl -X POST http://localhost:3000/api/v1/metrics \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "metrics": [{
      "name": "test_metric_total",
      "type": "counter",
      "value": 1,
      "labels": {
        "environment": "test",
        "service": "api"
      }
    }]
  }'
```

### 4.4: Verify in Prometheus

1. Open: `http://localhost:9090`
2. Go to Graph tab
3. Query: `test_metric_total`
4. You should see the metric

### 4.5: Verify in Grafana

1. Open Grafana: `http://localhost:3001`
2. Open the "Unified Visibility Platform - Metrics Dashboard"
3. You should see the metric appear in the panels

## Step 5: Test Frontend Integration

### 5.1: Start Frontend
```bash
cd frontend
npm install
npm run dev
```

### 5.2: Access Dashboard

1. Open: `http://localhost:5173`
2. Login with your credentials
3. Navigate to Dashboard page
4. Click "Show Embedded View" to see Grafana embedded
5. Or click "Open Grafana →" to open in new tab

### 5.3: Test Health Check

```bash
curl http://localhost:3000/health/grafana
```

Expected response:
```json
{
  "success": true,
  "status": "healthy",
  "grafana": {
    "url": "http://localhost:3001",
    "status": "healthy",
    "database": "connected",
    "version": "10.x.x"
  }
}
```

## Troubleshooting

### Dashboard Not Appearing

1. Check Grafana logs:
   ```bash
   docker-compose logs grafana | grep -i dashboard
   ```

2. Verify dashboard file exists:
   ```bash
   ls -la docker/grafana/dashboards/
   ```

3. Restart Grafana:
   ```bash
   docker-compose restart grafana
   ```

### Metrics Not Showing

1. Check if metrics are in Pushgateway:
   ```bash
   curl http://localhost:9091/metrics | grep test_metric
   ```

2. Check Prometheus targets:
   - Open: `http://localhost:9090/targets`
   - Verify Pushgateway shows as UP

3. Wait a few seconds for Prometheus to scrape

### Embedded View Not Working

1. Check browser console for errors
2. Verify CORS settings in docker-compose.yml
3. Check if Grafana URL is correct in frontend .env:
   ```env
   VITE_GRAFANA_URL=http://localhost:3001
   ```

## Next Steps

1. **Customize Dashboard**: Edit `docker/grafana/dashboards/metrics-dashboard.json`
2. **Add More Metrics**: Send different types of metrics (gauge, histogram, summary)
3. **Create Alerts**: Set up Grafana alerting rules
4. **User-Specific Dashboards**: Create dashboards filtered by user_id

## Useful Commands

```bash
# View all logs
docker-compose logs -f

# View Grafana logs only
docker-compose logs -f grafana

# Restart all services
docker-compose restart

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

## Support

If you encounter issues:
1. Check service logs
2. Verify all services are running
3. Check network connectivity
4. Review the full documentation in `docs/GRAFANA_INTEGRATION.md`

