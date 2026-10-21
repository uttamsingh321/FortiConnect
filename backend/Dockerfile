FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend codebase
COPY . /app/

# Expose port
EXPOSE 8000

# Run migrations and start Daphne ASGI server
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py seed_data && daphne -b 0.0.0.0 -p $PORT forticonnect.asgi:application"]
