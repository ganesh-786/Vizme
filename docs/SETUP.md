# Quick Setup Guide

## Prerequisites

- Node.js 20+ and npm
- Docker and Docker Compose (recommended)
- Git

## Quick Start with Docker

1. **Clone and navigate:**
   ```bash
   cd unified-project
   ```

2. **Start infrastructure:**
   ```bash
   cd docker
   docker-compose up -d
   ```

3. **Setup backend:**
   ```bash
   cd ../backend
   npm install
   cp .env.example .env
   # Edit .env with your settings
   npm start
   ```

4. **Setup frontend:**
   ```bash
   cd ../frontend
   npm install
   # Create .env file with VITE_API_BASE_URL=http://localhost:3000
   npm run dev
   ```

5. **Access:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - Grafana: http://localhost:3001 (admin/admin)
   - Prometheus: http://localhost:9090

## Manual Setup (Without Docker)

1. **Install PostgreSQL:**
   - Install PostgreSQL 15+
   - Create database: `createdb metrics_db`

2. **Start backend:**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Update DB_HOST, DB_USER, DB_PASSWORD in .env
   npm start
   ```

3. **Install Prometheus & Pushgateway:**
   - Download from https://prometheus.io/download/
   - Configure prometheus.yml to scrape pushgateway
   - Start both services

4. **Install Grafana:**
   - Download from https://grafana.com/grafana/download
   - Configure Prometheus datasource
   - Start Grafana

5. **Start frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## First Steps

1. **Sign up** at http://localhost:5173
2. **Create a metric configuration** (e.g., "User Clicks", type: counter)
3. **Generate an API key**
4. **Generate tracking code** and copy it
5. **Test** by creating an HTML file with the tracking code
6. **View metrics** in Grafana

## Troubleshooting

- **Backend won't start**: Check PostgreSQL is running and credentials are correct
- **Database errors**: Run migrations manually: `npm run migrate` in backend
- **Frontend can't connect**: Check CORS settings and API URL in .env
- **Metrics not showing**: Verify Pushgateway and Prometheus are running

For detailed documentation, see [README.md](./README.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).
