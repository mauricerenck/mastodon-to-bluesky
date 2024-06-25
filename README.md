# Mastodon to Bluesky
#### Crosspost from Mastodon to Bluesky

![GitHub release](https://img.shields.io/github/release/mauricerenck/mastodon-to-bluesky.svg?maxAge=1800) ![License](https://img.shields.io/github/license/mashape/apistatus.svg)

---

This scripts listens to your Mastodon account and crossposts your toots to your Bluesky account. It uses the Mastodon API and the Bluesky API to achieve this. The script is written in Node.js and can be run on your local machine or on a server.

---

## Installation

You can run the script directly using Node.js or you can use the Docker image.

### Node.js

Clone this repository and install the dependencies:

```bash
git clone https://github.com/mauricerenck/mastodon-to-bluesky.git
cd mastodon-to-bluesky
npm install
```

## Configuration

Create a `.env` file in the root directory of the project and add the following variables:

```bash
MASTODON_INSTANCE: 'https://mastodon.instance'
MASTODON_USER: 'username'
BLUESKY_ENDPOINT: 'https://bsky.social'
BLUESKY_HANDLE: 'USERNAME.bsky.social'
BLUESKY_PASSWORD: 'PASSWORD'
INTERVAL_MINUTES: 5
```

You can also set the same variables as environment variables in the `docker-compose.yml` file.

## Usage

To run the script, execute the following command:

```bash
node main.js
```

---

For more details see: https://maurice-renck.de/hub/tooling/crosspost-from-mastodon-to-bluesky
