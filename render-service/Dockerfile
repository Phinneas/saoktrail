FROM node:20-slim

# System deps for @maplibre/maplibre-gl-native + headless OpenGL
RUN apt-get update && apt-get install -y \
  libcurl4 \
  libuv1 \
  libjpeg-dev \
  libpng-dev \
  libwebp-dev \
  xvfb \
  libgl1-mesa-glx \
  libgl1-mesa-dri \
  libgles2-mesa \
  libgbm1 \
  libegl1 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxext6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json ./
RUN npm install

# Copy source and build TypeScript
COPY . .
RUN npm run build

# Remove devDependencies after build
RUN npm prune --omit=dev

# Fonts directory (populated separately — see README)
RUN mkdir -p src/fonts

EXPOSE 3000

CMD ["xvfb-run", "-a", "node", "dist/index.js"]
