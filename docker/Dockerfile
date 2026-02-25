# Stage 1: Build React app
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Caddy server with static files + dynamic proxy
FROM caddy:2.11-alpine

RUN apk add --no-cache jq

# Copy built static files
COPY --from=build /app/dist /srv

# Copy Caddy template and entrypoint
COPY docker/Caddyfile.template /etc/caddy/Caddyfile.template
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
