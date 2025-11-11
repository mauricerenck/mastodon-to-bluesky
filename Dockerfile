ARG DENO_VERSION=2.5.6

# Stage 1: Build mit Deno
FROM denoland/deno:alpine-${DENO_VERSION} as builder

WORKDIR /usr/src/app
COPY . .

RUN deno install
RUN deno task node-bundle

# Stage 2: run with NodeJS
FROM node:24-alpine

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist

CMD [ "node", "dist/main.js" ]
