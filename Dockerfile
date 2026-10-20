# BASE=node:26.10.0-slim (default) or platformatic/node-caged:26.10.0-slim (V8 pointer compression, 4 GiB heap cap; see DECISIONS.md #24)
ARG BASE=node:26.10.0-slim
FROM ${BASE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
COPY examples ./examples
COPY bench ./bench
RUN npx tsc

FROM ${BASE}
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr poppler-utils python3-pil bubblewrap util-linux \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
RUN (useradd -r -u 10001 app 2>/dev/null || true) && mkdir -p /data && chown 10001 /data
USER 10001
EXPOSE 8787
ENTRYPOINT ["node", "dist/src/cli.js"]
CMD ["serve", "--host", "0.0.0.0", "--log", "/data/audit.jsonl"]
