ARG DENO_VERSION=2.5.6

FROM denoland/deno:alpine-${DENO_VERSION}

WORKDIR /usr/src/app
COPY . .

RUN deno install
RUN deno task node-bundle

#CMD [ "deno", "task", "docker-run" ]
