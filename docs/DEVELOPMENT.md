# Development Guide

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)
- Git
- Code editor (VS Code recommended)

## Local Development Setup

### 1. Clone and Setup

```bash
git clone <repository-url>
cd unified_visibility_platform
cp .env.example .env
```

### 2. Start Services

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 3. Access Services

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Backend API**: http://localhost:8000 (when implemented)
- **Frontend**: http://localhost:3001 (when implemented)

## Development Workflow

### Backend Development

1. Navigate to `backend/` directory
2. Set up your development environment (Python/Node.js/etc.)
3. Implement API endpoints in `backend/api/`
4. Add authentication logic in `backend/auth/`
5. Create TSDB integration in `backend/tsdb/`

### Frontend Development

1. Navigate to `frontend/` directory
2. Set up your frontend framework
3. Connect to backend API
4. Implement visualization components

### Testing Prometheus Integration

1. Access Prometheus UI at http://localhost:9090
2. Use PromQL to query metrics
3. Test metric ingestion endpoints

### Testing Grafana Dashboards

1. Access Grafana at http://localhost:3000
2. Create or import dashboards
3. Configure Prometheus as data source (pre-configured)
4. Build visualizations

## Configuration

### Prometheus Configuration

Edit `docker/prometheus/prometheus.yml` to:
- Add scrape targets
- Configure alerting rules
- Adjust scrape intervals

### Grafana Configuration

- Datasources: `docker/grafana/provisioning/datasources/`
- Dashboards: `docker/grafana/provisioning/dashboards/`
- Custom dashboards: Export from Grafana UI and place in `docker/grafana/dashboards/`

## Environment Variables

Edit `.env` file for:
- Grafana admin credentials
- Prometheus retention settings
- API keys and secrets
- Database connections

## Code Style

- Follow language-specific style guides
- Use consistent naming conventions
- Add comments for complex logic
- Maintain clean code principles

## Testing

- Unit tests for individual components
- Integration tests for API endpoints
- End-to-end tests for complete workflows
- Load testing for performance validation

## Debugging

### View Service Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f prometheus
docker-compose logs -f grafana
```

### Access Service Shells

```bash
# Prometheus
docker exec -it unified_visibility_prometheus sh

# Grafana
docker exec -it unified_visibility_grafana sh
```

## Common Tasks

### Restart a Service

```bash
docker-compose restart <service-name>
```

### Rebuild Services

```bash
docker-compose up -d --build
```

### Clean Up

```bash
# Stop and remove containers
docker-compose down

# Remove volumes (WARNING: deletes data)
docker-compose down -v
```

## Best Practices

1. **Version Control**: Commit frequently with meaningful messages
2. **Documentation**: Update docs when adding features
3. **Configuration**: Never commit `.env` files
4. **Testing**: Write tests before implementing features
5. **Code Review**: Review code before merging

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :9090
lsof -i :3000

# Kill process or change port in docker-compose.yml
```

### Services Not Starting

```bash
# Check logs
docker-compose logs

# Verify Docker is running
docker ps

# Check disk space
df -h
```

### Prometheus Not Scraping

- Verify targets in Prometheus UI: http://localhost:9090/targets
- Check `prometheus.yml` configuration
- Verify network connectivity between services

## Next Steps

- Implement backend API endpoints
- Create frontend application
- Set up CI/CD pipeline
- Configure monitoring and alerting
- Add comprehensive testing

