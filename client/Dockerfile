FROM node:24.13.0-alpine3.23 AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci && npm cache clean --force

COPY . .

RUN npm run build

FROM nginx:1.28.0-alpine3.21 AS runtime

RUN addgroup -g 1001 -S app && adduser -S app -u 1001 && \
    chown -R app:app /var/cache/nginx /var/log/nginx && \
    sed -i 's|/var/run/nginx.pid|/tmp/nginx.pid|' /etc/nginx/nginx.conf

COPY --from=build --chown=app:app /app/build /usr/share/nginx/html
COPY --chown=app:app docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --chown=app:app docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

USER app

CMD ["nginx", "-g", "daemon off;"]

FROM node:24.13.0-alpine3.23 AS dev

WORKDIR /app

COPY package*.json ./

RUN npm ci

EXPOSE 3000 24678

CMD ["npx", "vite", "--port", "3000", "--host", "0.0.0.0"]
