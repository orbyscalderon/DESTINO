# Encuentros — Dockerfile aislado
# Deploy a domain INDEPENDIENTE de Destino TV
FROM node:20-alpine AS builder
WORKDIR /app

COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN cd frontend && npm install
RUN cd backend && npm install

COPY frontend ./frontend
COPY backend ./backend

RUN cd frontend && npm run build

# ── Runtime ───
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/frontend/dist ./public
WORKDIR /app/backend
EXPOSE 4100
CMD ["node", "server.js"]
