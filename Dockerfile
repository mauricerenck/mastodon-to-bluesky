ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-bookworm-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

CMD [ "node", "main.js" ]
