FROM gradle:9.7.1-jdk21 AS newpipe-build
WORKDIR /src/newpipe-bridge
COPY newpipe-bridge ./
RUN gradle --no-daemon clean installDist

FROM node:24.21.0-trixie-slim
ARG YTDLP_VERSION=2026.08.19

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates openjdk-21-jre-headless \
 && python3 -m venv /opt/yt \
 && /opt/yt/bin/pip install --no-cache-dir --upgrade pip \
 && /opt/yt/bin/pip install --no-cache-dir "yt-dlp[default]==${YTDLP_VERSION}" \
 && ln -s /opt/yt/bin/yt-dlp /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*

COPY --from=newpipe-build /src/newpipe-bridge/build/install/zexl-newpipe /opt/zexl-newpipe

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY THIRD_PARTY_NOTICES.md /usr/share/doc/zexl/THIRD_PARTY_NOTICES.md
COPY licenses/GPL-3.0.txt /usr/share/doc/zexl/GPL-3.0.txt

ENV NODE_ENV=production
ENV PORT=10000
ENV NEWPIPE_RESOLVER_PATH=/opt/zexl-newpipe/bin/zexl-newpipe
EXPOSE 10000
CMD ["node", "src/server.js"]
