# Stage 1: Build Frontend SPA
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend Runtime & Production Image
FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

EXPOSE 5001
CMD ["node", "src/index.js"]
