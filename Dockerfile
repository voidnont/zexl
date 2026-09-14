FROM node:26.8-trixie-slim
ARG YTDLP_VERSION=2026.08.19

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates \
 && python3 -m venv /opt/yt \
 && /opt/yt/bin/pip install --no-cache-dir --upgrade pip \
 && /opt/yt/bin/pip install --no-cache-dir "yt-dlp[default]==${YTDLP_VERSION}" \
 && ln -s /opt/yt/bin/yt-dlp /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY THIRD_PARTY_NOTICES.md /usr/share/doc/zexl/THIRD_PARTY_NOTICES.md

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["node", "src/server.js"]
