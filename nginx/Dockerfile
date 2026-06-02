FROM nginx:1.26-alpine
COPY nginx.conf /etc/nginx/nginx.conf
# SSL directory is mounted as a volume at runtime
RUN mkdir -p /etc/nginx/ssl /app/frontend /app/staticfiles /app/media
