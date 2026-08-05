# Quick Setup Guide

## Prerequisites

- Node.js 20+ and npm
- Docker and Docker Compose (recommended)
- Git

## Quick Start with Docker

1. **Clone and navigate:**

   ```bash
   git clone https://github.com/ganesh-786/Vizme.git
   cd Vizme
   ```

2. **Start infrastructure** (PostgreSQL, Grafana Mimir, Prometheus, Grafana, Alertmanager):

   ```bash
   cd docker
   cp .env.example .env
   # Edit .env — at minimum set JWT_SECRET (openssl rand -base64 32)
   docker compose --profile local-db up -d
   cd ..
   ```

3. **Setup backend:**

   ```bash
   cd backend
   npm install
   npm run migrate      # Creates database tables
   npm run dev           # Starts on :3000 with auto-reload
   ```

4. **Setup frontend** (in a new terminal):

   ```bash
   cd frontend
   npm install
   npm run dev            # Starts on :5173, proxies /api and /grafana to :3000
   ```

5. **Access:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - Grafana: http://localhost:3001 (admin/admin unless overridden)
   - Prometheus: http://localhost:9090
   - Mimir: http://localhost:9009

## Manual Setup (Without Docker)

1. **Install PostgreSQL 15+** and create a database:

   ```bash
   createdb metrics_db
   ```

2. **Configure and start the backend:**

   ```bash
   cd backend
   npm install
   # Backend reads DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET, etc.
   # See backend/src/config.js for every variable and its default.
   export DB_HOST=localhost DB_NAME=metrics_db DB_USER=postgres DB_PASSWORD=yourpassword
   export JWT_SECRET=$(openssl rand -base64 32)
   npm run migrate
   npm start
   ```

3. **Install and run Prometheus, Grafana Mimir, and Grafana** manually (see `docker/prometheus/`, `docker/mimir/`, and `docker/grafana/` for reference configs), or keep using Docker Compose just for the infra services while running the backend/frontend on the host.

4. **Start the frontend:**

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## First Steps

1. **Sign up** at http://localhost:5173
2. **Create a metric configuration** (e.g., "User Clicks", type: counter)
3. **Generate an API key**
4. **Generate tracking code** and copy the snippet
5. **Test** by pasting the snippet into an HTML page and loading it in a browser
6. **View metrics** in your auto-provisioned Grafana dashboard

## Troubleshooting

- **Backend won't start**: it fails fast if `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` are missing, or (in production) if `JWT_SECRET` is missing/weak — check the startup error message.
- **Database errors**: run migrations manually: `npm run migrate` in `backend/`.
- **Frontend can't connect**: check `ALLOWED_METRICS_ORIGINS`/CORS settings and `VITE_API_BASE_URL`.
- **Grafana embed shows 401**: the embed iframe must be same-origin as the app so the auth cookie is sent — see [docs/operations/PRODUCTION.md](../operations/PRODUCTION.md#reverse-proxy-grafana-embed).
- **Docker issues**: see [docker/docker_docs/TROUBLESHOOTING.md](../../docker/docker_docs/TROUBLESHOOTING.md).

For detailed documentation, see [README.md](../../README.md) and [ARCHITECTURE.md](../architecture/ARCHITECTURE.md).
