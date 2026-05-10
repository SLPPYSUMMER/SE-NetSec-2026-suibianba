#!/bin/sh
set -x
echo "Entrypoint script is running"

# Wait for the database with exponential backoff
RETRIES=0
MAX_RETRIES=30
until PGPASSWORD=$POSTGRES_PASSWORD psql -h "db" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\q' 2>/dev/null; do
  RETRIES=$((RETRIES+1))
  if [ $RETRIES -ge $MAX_RETRIES ]; then
    >&2 echo "Could not connect to database after $MAX_RETRIES attempts. Exiting."
    exit 1
  fi
  WAIT=$((RETRIES * 2))
  if [ $WAIT -gt 30 ]; then WAIT=30; fi
  >&2 echo "Postgres is unavailable (attempt $RETRIES/$MAX_RETRIES) - sleeping ${WAIT}s"
  sleep $WAIT
done

>&2 echo "Postgres is up - executing command"

if python manage.py showmigrations --plan 2>/dev/null | grep -q "\[ \]"; then
    echo "Running migrations..."
    python manage.py migrate
    echo "Loading initial data..."
    python manage.py loaddata website/fixtures/initial_data.json 2>/dev/null || true
    echo "Creating superuser..."
    python manage.py initsuperuser
    echo "Collecting static files..."
    python manage.py collectstatic --noinput 2>/dev/null || true
else
    echo "All migrations already applied."
fi

# Start the main application
echo "Starting the main application http://localhost:8000/"
exec python manage.py runserver 0.0.0.0:8000