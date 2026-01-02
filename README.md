# Unified Visibility Platform

A professional metrics visualization platform that collects metrics from users and visualizes them using Prometheus (TSDB) and Grafana.

## Overview

The Unified Visibility Platform enables organizations to visualize product/service health over time by:
- Collecting metrics from various sources
- Storing metrics in Prometheus (Time Series Database)
- Visualizing metrics through Grafana dashboards

## Architecture

```
┌─────────────┐
│   Frontend  │  (User Interface)
└──────┬──────┘
       │
┌──────▼──────┐
│   Backend   │  (API, Auth, Metrics Collection)
└──────┬──────┘
       │
┌──────▼──────┐
│  Prometheus │  (Time Series Database)
└──────┬──────┘
       │
┌──────▼──────┐
│   Grafana   │  (Visualization & Dashboards)
└─────────────┘
```

## Project Structure

```
unified_visibility_platform/
├── backend/          # Backend services
│   ├── api/         # API endpoints
│   ├── auth/        # Authentication services
│   ├── clientlib/   # Client libraries
│   ├── routes/      # Route definitions
│   └── tsdb/        # Time Series Database integration
├── frontend/        # Frontend application
├── docker/          # Docker configurations
├── docs/            # Documentation
└── docker-compose.yml  # Docker Compose orchestration
```

## Prerequisites

- Docker and Docker Compose
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
- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090
- Backend API: http://localhost:8000 (when implemented)
- Frontend: http://localhost:3001 (when implemented)

## Services

### Prometheus
- **Port**: 9090
- **Purpose**: Time Series Database for metrics storage
- **Configuration**: `docker/prometheus/prometheus.yml`

### Grafana
- **Port**: 3000
- **Purpose**: Metrics visualization and dashboards
- **Default Credentials**: admin/admin (change on first login)

### Backend API
- **Port**: 8000
- **Purpose**: REST API for metrics collection and management

### Frontend
- **Port**: 3001
- **Purpose**: User interface for the platform

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for development setup and guidelines.

## Documentation

- [Architecture Documentation](docs/ARCHITECTURE.md)
- [API Documentation](docs/API.md) (to be added)
- [Deployment Guide](docs/DEPLOYMENT.md) (to be added)

## Contributing

1. Create a feature branch
2. Make your changes
3. Submit a pull request

## License

[To be specified]

## Support

For issues and questions, please open an issue in the repository.

