# Mastodon to Bluesky

Crosspost from Mastodon to Bluesky

![GitHub release](https://img.shields.io/github/release/mauricerenck/mastodon-to-bluesky.svg?maxAge=1800) ![License](https://img.shields.io/github/license/mashape/apistatus.svg)

This scripts listens to your Mastodon account and crossposts your toots to your Bluesky account. It uses the Mastodon API and the Bluesky API to achieve this. The script is written in Typescript and can be run on your local machine or on a server.

## Coverage

| Statements                  | Branches                | Functions                 | Lines             |
| --------------------------- | ----------------------- | ------------------------- | ----------------- |
| ![Statements](https://img.shields.io/badge/statements-100%25-brightgreen.svg?style=flat) | ![Branches](https://img.shields.io/badge/branches-96.36%25-brightgreen.svg?style=flat) | ![Functions](https://img.shields.io/badge/functions-100%25-brightgreen.svg?style=flat) | ![Lines](https://img.shields.io/badge/lines-100%25-brightgreen.svg?style=flat) |

## Installation

You can run the script directly using [NodeJS](https://www.nodejs.org) or you can use our Docker image.

### Direct

- Clone this repository and install the dependencies:

```bash
git clone https://github.com/mauricerenck/mastodon-to-bluesky.git
cd mastodon-to-bluesky
npm install
```

- [set environment variables](#configuration)
- run the script:

    ```bash
    npm run build
    npm run start
    ```

### Docker 🐳

#### Build Image

```bash
docker build -t mastodon-to-bluesky .

# optional with Node version
docker build --build-arg NODE_VERSION=24 -t mastodon-to-bluesky .
```

#### Compose

- *Docker* and *Docker Compose* should installed
- copy [docker-compose.yml](https://github.com/mauricerenck/mastodon-to-bluesky/blob/main/docker-compose.yml) to your local machine
- change environment variables
- start via `docker compose up -d`
- stop via `docker compose down`

## Configuration

Create a `.env` file in the root directory of the project and add the following variables:

```bash
MASTODON_INSTANCE: 'https://mastodon.instance'
MASTODON_USER: 'username'
BLUESKY_ENDPOINT: 'https://bsky.social'
BLUESKY_HANDLE: 'USERNAME.bsky.social'
BLUESKY_PASSWORD: 'PASSWORD'
BLUESKY_MAX_POST_LENGTH: 300
INTERVAL_MINUTES: 5
```

---

For more details see: <https://maurice-renck.de/hub/tooling/crosspost-from-mastodon-to-bluesky>
