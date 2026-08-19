FROM node:22-alpine AS build

WORKDIR /app
ARG VITE_API_BASE_URL=http://127.0.0.1:8000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run lint && npm run test:v2 && npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Run as the image's built-in unprivileged "nginx" user. Port 8080 doesn't
# need root to bind, so once nginx's own working directories are writable
# by that user, the master process doesn't need root either.
RUN mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp /var/cache/nginx/fastcgi_temp \
             /var/cache/nginx/uwsgi_temp /var/cache/nginx/scgi_temp \
    && touch /var/run/nginx.pid \
    && chown -R nginx:nginx /var/cache/nginx /var/run/nginx.pid /usr/share/nginx/html /etc/nginx

USER nginx

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
