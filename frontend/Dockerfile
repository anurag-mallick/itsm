FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Minimal image — copies built dist to a mounted volume on startup
FROM alpine:3.19
WORKDIR /app
COPY --from=builder /app/dist ./dist
CMD ["/bin/sh", "-c", "cp -rp /app/dist/. /mnt/frontend/ && echo 'Frontend assets ready.'"]
