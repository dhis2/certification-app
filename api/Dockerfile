FROM node:24.13.0-alpine3.23 AS base

RUN apk add --no-cache dumb-init

FROM base AS deps

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

FROM base AS dev-deps

WORKDIR /app

COPY package*.json ./

RUN npm ci --ignore-scripts && \
    npm cache clean --force

FROM base AS build

WORKDIR /app

COPY --from=dev-deps /app/node_modules ./node_modules
COPY . .

RUN npm run build && \
    find ./dist -name "*.map" -type f -delete

FROM base AS runtime

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --chown=nodejs:nodejs package.json ./
RUN mkdir -p /app/logs && \
    chown -R nodejs:nodejs /app/logs

ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048"

EXPOSE 3001

USER nodejs

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "dist/main.js"]

FROM base AS dev

RUN apk add --no-cache make gcc g++ python3 git

WORKDIR /app

COPY package*.json ./

RUN npm ci

EXPOSE 3001 9229

CMD ["npm", "run", "start:dev"]
