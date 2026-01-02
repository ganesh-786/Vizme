# Deployment Guide

## Production Deployment

### Prerequisites

- Docker and Docker Compose installed
- Domain name configured (optional)
- SSL certificates (for HTTPS)
- Backup strategy in place

### Environment Setup

1. Copy environment template:
```bash
cp env.template .env
```

2. Update `.env` with production values:
   - Change default Grafana admin credentials
   - Set secure API keys
   - Configure database URLs
   - Set production environment variables

### Docker Compose Production

1. Review `docker-compose.yml` for production settings
2. Update resource limits if needed
3. Configure volume mounts for persistent storage
4. Set up network security

### Deployment Steps

1. **Pull latest code**:
```bash
git pull origin main
```

2. **Build and start services**:
```bash
docker-compose up -d --build
```

3. **Verify services**:
```bash
docker-compose ps
docker-compose logs
```

4. **Configure Grafana**:
   - Access Grafana UI
   - Change default admin password
   - Configure data sources
   - Import dashboards

5. **Configure Prometheus**:
   - Update scrape targets
   - Configure alerting rules
   - Set retention policies

### Security Considerations

- Use strong passwords for all services
- Enable HTTPS/TLS
- Configure firewall rules
- Restrict network access
- Regular security updates
- Monitor access logs

### Backup Strategy

#### Prometheus Data
```bash
docker run --rm -v unified_visibility_platform_prometheus_data:/data \
  -v $(pwd):/backup prom/prometheus \
  tar czf /backup/prometheus-backup.tar.gz /data
```

#### Grafana Data
```bash
docker run --rm -v unified_visibility_platform_grafana_data:/data \
  -v $(pwd):/backup grafana/grafana \
  tar czf /backup/grafana-backup.tar.gz /data
```

### Monitoring

- Monitor service health
- Set up alerting
- Track resource usage
- Review logs regularly

### Scaling

- Horizontal scaling for backend API
- Prometheus federation for large deployments
- Grafana high availability
- Load balancing

### Rollback Procedure

1. Stop current services:
```bash
docker-compose down
```

2. Restore previous version:
```bash
git checkout <previous-version>
docker-compose up -d
```

3. Restore data backups if needed

### Maintenance

- Regular updates
- Database maintenance
- Log rotation
- Disk space monitoring
- Performance optimization

## Cloud Deployment

### AWS
- Use ECS or EKS for container orchestration
- RDS for managed databases
- CloudWatch for monitoring
- S3 for backups

### Azure
- Azure Container Instances or AKS
- Azure Database services
- Azure Monitor
- Azure Blob Storage

### GCP
- Cloud Run or GKE
- Cloud SQL
- Cloud Monitoring
- Cloud Storage

## Troubleshooting

### Service Won't Start
- Check logs: `docker-compose logs <service>`
- Verify environment variables
- Check port availability
- Review resource limits

### Performance Issues
- Monitor resource usage
- Optimize queries
- Scale services
- Review configuration

### Data Loss
- Restore from backups
- Check volume mounts
- Verify retention policies

