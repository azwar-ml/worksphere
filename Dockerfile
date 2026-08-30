# Start with Python base image
FROM python:3.10-slim

# Install Node.js 20.x for Next.js
RUN apt-get update && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the entire project into the container
COPY . .

# Setup Python Backend
WORKDIR /app/backend
RUN pip install --no-cache-dir -r requirements.txt

# Setup Next.js Frontend
WORKDIR /app/frontend
RUN npm install

# Go back to root and make start script executable
WORKDIR /app
RUN chmod +x start.sh

# Render provides the PORT environment variable
ENV PORT=10000
EXPOSE $PORT

# Boot up the unified container
CMD ["./start.sh"]