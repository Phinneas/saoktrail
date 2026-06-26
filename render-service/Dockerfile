FROM node:20-slim

# sharp + fonts for librsvg SVG text rendering
RUN apt-get update && apt-get install -y \
  libjpeg-dev \
  libpng-dev \
  libwebp-dev \
  fontconfig \
  fonts-liberation \
  fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/* \
  && fc-cache -fv

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build
RUN npm prune --omit=dev

EXPOSE 3000

CMD ["node", "dist/index.js"]
