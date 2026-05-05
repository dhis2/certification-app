FROM node@sha256:f587a14b20e59fa6706b0bd82ef3ee330fd4c49f6372e37ed4920d0b6874e4ec AS base

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile && yarn cache clean

COPY . .

ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

RUN yarn build

FROM nginx:1.28.0-alpine3.21 AS runtime

RUN apk add --no-cache wget && \
    addgroup -g 1001 -S app && adduser -S app -u 1001 && \
    sed -i 's|/var/run/nginx.pid|/tmp/nginx.pid|' /etc/nginx/nginx.conf && \
    sed -i 's|/run/nginx.pid|/tmp/nginx.pid|' /etc/nginx/nginx.conf

COPY --from=base --chown=app:app /app/build /usr/share/nginx/html
COPY --chown=app:app docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --chown=app:app docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

USER app

CMD ["nginx", "-g", "daemon off;"]

FROM node@sha256:f587a14b20e59fa6706b0bd82ef3ee330fd4c49f6372e37ed4920d0b6874e4ec AS dev

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

EXPOSE 3000 24678

CMD ["npx", "vite", "--port", "3000", "--host", "0.0.0.0"]
