FROM oven/bun:1 AS frontend-deps
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN bun install

FROM frontend-deps AS frontend-build
COPY frontend/ ./
ENV NODE_OPTIONS="--max-old-space-size=384"
RUN bun run build

FROM oven/bun:1
WORKDIR /app

COPY backend/package.json backend/bun.lock* ./backend/
RUN cd backend && bun install --production

COPY backend/ ./backend/
COPY scripts/ ./scripts/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data

ENV HOST=0.0.0.0 \
    PORT=5555 \
    DB_PATH=/app/data/health.sqlite

EXPOSE 5555
CMD ["bun", "--cwd", "backend", "src/server.ts"]
