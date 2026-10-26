FROM node:20-alpine

# Install FFmpeg and bash
RUN apk add --no-cache ffmpeg bash

WORKDIR /app

# Copy package descriptors
COPY package*.json ./
RUN npm ci --omit=dev

# Copy worker script
COPY scripts/ffmpeg-worker.ts ./scripts/
COPY tsconfig*.json ./

CMD ["npx", "tsx", "scripts/ffmpeg-worker.ts"]
