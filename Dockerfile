# ========== Stage 1: Build frontend ==========
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci || npm install
COPY client/ ./
RUN npm run build

# ========== Stage 2: Cài dependency backend ==========
FROM node:22-alpine AS server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# ========== Stage 3: Runtime ==========
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# Chạy bằng user không phải root cho an toàn
RUN addgroup -S app && adduser -S app -G app

COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/ ./
# Frontend build được backend phục vụ từ thư mục public/
COPY --from=client-build /app/client/dist ./public

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "index.js"]
