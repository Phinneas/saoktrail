FROM node:20-slim

# sharp needs these for PNG/JPEG processing
RUN apt-get update && apt-get install -y \
  libjpeg-dev \
  libpng-dev \
  libwebp-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build
RUN npm prune --omit=dev

EXPOSE 3000

CMD ["node", "dist/index.js"]
