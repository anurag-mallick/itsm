#!/bin/sh
set -e

echo "Waiting for PostgreSQL..."
until python -c "import psycopg2; psycopg2.connect(
    dbname='$DB_NAME', user='$DB_USER', password='$DB_PASSWORD',
    host='$DB_HOST', port='$DB_PORT'
)" 2>/dev/null; do
  sleep 1
done
echo "PostgreSQL is ready."

if [ "$RUN_MIGRATIONS" = "True" ]; then
  echo "Running migrations..."
  python manage.py migrate --noinput

  echo "Seeding system configuration defaults..."
  python manage.py setup_config

  echo "Seeding demo data (categories, sites, users)..."
  python manage.py setup_demo_data
else
  echo "Skipping migrations and seeding (RUN_MIGRATIONS is not True)."
fi

exec "$@"
