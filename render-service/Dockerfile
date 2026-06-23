FROM node:20-slim

# System deps required by @maplibre/maplibre-gl-native
RUN apt-get update && apt-get install -y \
  libcurl4 \
  libuv1 \
  libjpeg-dev \
  libpng-dev \
  libwebp-dev \
  xvfb \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Fonts directory (populated separately — see README)
RUN mkdir -p src/fonts

EXPOSE 3000

CMD ["node", "dist/index.js"]
