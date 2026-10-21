-- FortiConnect PostgreSQL Setup Script
-- Run this as the postgres superuser:
-- psql -U postgres -f scripts/init_db.sql

-- Create development user
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'forticonnect_user') THEN
        CREATE USER forticonnect_user WITH PASSWORD 'forticonnect_pass';
    END IF;
END
$$;

-- Create development database
SELECT 'CREATE DATABASE forticonnect_dev OWNER forticonnect_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'forticonnect_dev')\gexec

-- Create test database
SELECT 'CREATE DATABASE forticonnect_test OWNER forticonnect_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'forticonnect_test')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE forticonnect_dev TO forticonnect_user;
GRANT ALL PRIVILEGES ON DATABASE forticonnect_test TO forticonnect_user;

-- Connect to dev database and grant schema access
\c forticonnect_dev
GRANT ALL ON SCHEMA public TO forticonnect_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO forticonnect_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO forticonnect_user;

-- Connect to test database and grant schema access
\c forticonnect_test
GRANT ALL ON SCHEMA public TO forticonnect_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO forticonnect_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO forticonnect_user;

\c postgres
\echo 'FortiConnect databases created successfully.'

