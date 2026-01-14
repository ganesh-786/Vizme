#!/bin/bash
# Script to manually create Keycloak database and user if init script didn't run
# Run this if Keycloak is failing to connect to PostgreSQL

echo "Creating Keycloak database and user manually..."

# Check if postgres container is running
if ! docker ps | grep -q metrics_postgres; then
    echo "Error: PostgreSQL container is not running!"
    echo "Please start it first: docker compose up -d postgres"
    exit 1
fi

# Create user if it doesn't exist
docker exec metrics_postgres psql -U postgres -d template1 -c "
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'keycloak') THEN
        CREATE USER keycloak WITH PASSWORD 'keycloak';
        RAISE NOTICE 'User keycloak created';
    ELSE
        RAISE NOTICE 'User keycloak already exists';
    END IF;
END
\$\$;
"

# Create database if it doesn't exist
docker exec metrics_postgres psql -U postgres -d template1 -tc "
SELECT 1 FROM pg_database WHERE datname = 'keycloak_db'
" | grep -q 1 || docker exec metrics_postgres psql -U postgres -d template1 -c "CREATE DATABASE keycloak_db;"

# Grant privileges
docker exec metrics_postgres psql -U postgres -d template1 -c "
GRANT ALL PRIVILEGES ON DATABASE keycloak_db TO keycloak;
"

# Grant schema privileges
docker exec metrics_postgres psql -U postgres -d keycloak_db -c "
GRANT ALL ON SCHEMA public TO keycloak;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO keycloak;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO keycloak;
"

echo ""
echo "✅ Done! Keycloak database and user are ready."
echo "Now restart Keycloak: docker compose restart keycloak"
