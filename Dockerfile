ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD [ "npx", "ts-node", "src/main.ts" ]
