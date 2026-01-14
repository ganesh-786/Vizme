#!/bin/bash
set -e

echo "Creating Keycloak database and user..."

# Use template1 to ensure we can create databases even if metrics_db doesn't exist yet
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "template1" <<-EOSQL
	-- Create user if it doesn't exist
	DO \$\$
	BEGIN
		IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'keycloak') THEN
			CREATE USER keycloak WITH PASSWORD 'keycloak';
		END IF;
	END
	\$\$;
EOSQL

# Create database if it doesn't exist (using separate command for better compatibility)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "template1" -tc "
	SELECT 1 FROM pg_database WHERE datname = 'keycloak_db'
" | grep -q 1 || psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "template1" -c "CREATE DATABASE keycloak_db;"

# Grant privileges
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "template1" <<-EOSQL
	GRANT ALL PRIVILEGES ON DATABASE keycloak_db TO keycloak;
EOSQL

echo "Keycloak database and user created successfully!"
