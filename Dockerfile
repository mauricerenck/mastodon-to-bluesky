ARG NODE_VERSION=24

# stage 1 (transpile code)
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# stage 2 (run code)
FROM node:${NODE_VERSION}-alpine AS runner

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# --chown=node:node
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

#USER node

CMD [ "node", "dist/main.js" ]
