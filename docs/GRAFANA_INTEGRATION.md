# Grafana Integration Guide

This document provides comprehensive information about the Grafana integration in the Unified Visibility Platform.

## Overview

Grafana is integrated to visualize metrics collected from your applications. The integration includes:

- **Automatic Dashboard Provisioning**: Pre-configured dashboard that loads automatically
- **Prometheus Datasource**: Pre-configured connection to Prometheus
- **Embedded Dashboard View**: Option to embed Grafana dashboard in the frontend
- **Health Monitoring**: Backend endpoint to check Grafana connectivity

## Architecture

```
Client Applications
    ↓
Backend API (/api/v1/metrics)
    ↓
Prometheus Pushgateway
    ↓
Prometheus (Time-series DB)
    ↓
Grafana (Visualization)
```

## Configuration

### Docker Compose

Grafana is configured in `docker/docker-compose.yml`:

- **Port**: 3001 (mapped from container port 3000)
- **Default Credentials**: admin/admin
- **Dashboard Path**: `/var/lib/grafana/dashboards`
- **Provisioning Path**: `/etc/grafana/provisioning`

### Environment Variables

You can customize Grafana settings via environment variables:

```env
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=your-secure-password
GRAFANA_URL=http://localhost:3001
```

### Datasource Configuration

The Prometheus datasource is automatically provisioned from:
`docker/grafana/provisioning/datasources/prometheus.yml`

- **Name**: Prometheus
- **Type**: prometheus
- **URL**: http://prometheus:9090
- **UID**: prometheus

### Dashboard Configuration

The main dashboard is automatically loaded from:
`docker/grafana/dashboards/metrics-dashboard.json`

- **Dashboard UID**: metrics-dashboard
- **Auto-refresh**: 10 seconds
- **Time Range**: Last 1 hour (default)

## Dashboard Panels

The metrics dashboard includes the following panels:

1. **Total Metrics Received**: Count of all metrics
2. **Metrics Rate**: Metrics per second
3. **Metrics by Job**: Pie chart showing distribution by job
4. **Metrics Rate Over Time**: Time series graph
5. **Metrics by User ID**: Table showing metrics per user
6. **All Metrics Timeline**: Complete timeline of all metrics

## Usage

### Accessing Grafana

1. **Direct Access**: Navigate to `http://localhost:3001`
2. **Login**: Use default credentials (admin/admin) or your configured credentials
3. **Dashboard**: The "Unified Visibility Platform - Metrics Dashboard" should be available

### Embedded View

The frontend Dashboard page includes an option to embed Grafana:

1. Navigate to the Dashboard page in the frontend
2. Click "Show Embedded View" button
3. The Grafana dashboard will load in an iframe

### Health Check

Check Grafana connectivity via the backend API:

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

## PromQL Queries

The dashboard uses the following PromQL queries:

### Total Metrics
```promql
count({__name__=~".+"})
```

### Metrics Rate
```promql
sum(rate({__name__=~".+"}[5m]))
```

### Metrics by Job
```promql
count by (job) ({__name__=~".+"})
```

### Metrics by User
```promql
count by (user_id) ({__name__=~".+"})
```

### All Metrics
```promql
{__name__=~".+"}
```

## Troubleshooting

### Dashboard Not Appearing

1. **Check File Permissions**: Ensure dashboard JSON file is readable
2. **Verify JSON Syntax**: Validate JSON syntax is correct
3. **Check Grafana Logs**: `docker-compose logs grafana`
4. **Restart Grafana**: `docker-compose restart grafana`

### Metrics Not Showing

1. **Verify Pushgateway**: Check if metrics are being pushed
   ```bash
   curl http://localhost:9091/metrics
   ```

2. **Check Prometheus Targets**: 
   - Navigate to `http://localhost:9090/targets`
   - Verify Pushgateway is UP

3. **Verify Metric Names**: Ensure metric names match PromQL queries

### Datasource Connection Failed

1. **Check Prometheus**: Verify Prometheus is running
   ```bash
   docker-compose ps prometheus
   ```

2. **Network Connectivity**: Ensure Grafana can reach Prometheus
   ```bash
   docker exec metrics_grafana ping prometheus
   ```

3. **Verify URL**: Check datasource URL in Grafana UI

### Embedded View Not Loading

1. **CORS Configuration**: Verify CORS settings in docker-compose.yml
2. **Grafana URL**: Check `VITE_GRAFANA_URL` environment variable
3. **Browser Console**: Check browser console for errors
4. **Direct Access**: Try accessing Grafana directly to verify it's running

## Customization

### Adding New Panels

1. Access Grafana UI at `http://localhost:3001`
2. Edit the dashboard
3. Add new panels with custom PromQL queries
4. Export the dashboard JSON
5. Replace `docker/grafana/dashboards/metrics-dashboard.json`

### Creating User-Specific Dashboards

1. Use Grafana variables to filter by user_id
2. Create dashboard with variable: `$user_id`
3. Set up authentication to pass user context
4. Export and provision the dashboard

### Custom Queries

You can create custom PromQL queries based on your metric structure:

```promql
# Counter metrics
increase({__name__=~".+_total"}[1h])

# Gauge metrics
{__name__=~".+_gauge"}

# Metrics with specific labels
{__name__=~".+", environment="production"}
```

## Security Considerations

### Production Deployment

1. **Change Default Password**: Update `GRAFANA_ADMIN_PASSWORD`
2. **Enable HTTPS**: Configure SSL/TLS certificates
3. **Authentication**: Set up OAuth or LDAP authentication
4. **Network Security**: Restrict Grafana access to internal network
5. **Backup**: Regularly backup Grafana data volume

### Backup

```bash
# Backup Grafana data
docker exec metrics_grafana tar czf /tmp/grafana-backup.tar.gz /var/lib/grafana
docker cp metrics_grafana:/tmp/grafana-backup.tar.gz ./grafana-backup.tar.gz
```

### Restore

```bash
# Restore Grafana data
docker cp ./grafana-backup.tar.gz metrics_grafana:/tmp/
docker exec metrics_grafana tar xzf /tmp/grafana-backup.tar.gz -C /
docker-compose restart grafana
```

## API Integration

### Backend Service

The `grafanaService` provides methods to interact with Grafana API:

```javascript
import { grafanaService } from './services/grafana.service.js';

// Check health
const health = await grafanaService.checkHealth();

// Get dashboard
const dashboard = await grafanaService.getDashboard('metrics-dashboard');

// Get datasource
const datasource = await grafanaService.getDatasource('Prometheus');
```

## Best Practices

1. **Dashboard Organization**: Use folders and tags to organize dashboards
2. **Query Optimization**: Use efficient PromQL queries to reduce load
3. **Refresh Intervals**: Set appropriate refresh intervals (10s for real-time, 1m for historical)
4. **Alerting**: Set up Grafana alerts for critical metrics
5. **Documentation**: Document custom queries and panels
6. **Version Control**: Keep dashboard JSON files in version control

## Support

For issues or questions:
1. Check Grafana logs: `docker-compose logs grafana`
2. Check Prometheus logs: `docker-compose logs prometheus`
3. Verify network connectivity between services
4. Review this documentation

