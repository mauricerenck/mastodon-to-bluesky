ARG DENO_VERSION=2.4.3

FROM denoland/deno:alpine-${DENO_VERSION}

WORKDIR /app
COPY . .

RUN deno cache main.ts

CMD [ "deno", "task", "run" ]
