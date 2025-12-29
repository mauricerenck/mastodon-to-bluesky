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

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

CMD [ "node", "dist/index.js" ]
