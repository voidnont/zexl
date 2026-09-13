FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates \
 && python3 -m venv /opt/yt \
 && /opt/yt/bin/pip install --no-cache-dir --upgrade pip yt-dlp \
 && ln -s /opt/yt/bin/yt-dlp /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["node", "src/server.js"]
