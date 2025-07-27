ARG DENO_VERSION=2.4.2

FROM denoland/deno:alpine-${DENO_VERSION}

WORKDIR /usr/src/app

COPY deno.* ./
RUN deno install

COPY . .

CMD [ "deno", "main.ts" ]
