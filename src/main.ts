import "dotenv/config";
import * as bluesky from "./bluesky/index.js";
import * as mastodon from "./mastodon/index.js";
import { getIntegerEnv } from "./config.js";
import { logger } from "./logger.js";
import { loadAttachments, loadLastProcessedPostId, saveLastProcessedPostId } from "./utils.js";

const intervalMinutes = getIntegerEnv("INTERVAL_MINUTES", {
    defaultValue: 5,
    min: 1,
    max: 1440
});
logger.info("Configured polling interval", { intervalMinutes });

async function main() {
    type BlueskyPostResponse = Awaited<ReturnType<typeof bluesky.post>>;

    // Variable to store the last processed Mastodon post ID
    let lastProcessedPostId = await loadLastProcessedPostId();
    logger.info("Loaded last processed post marker", { lastProcessedPostId });

    try {
        const statuses = await mastodon.fetchNewToots();
        logger.info("Fetched Mastodon statuses", { count: statuses.length });

        let newTimestampId = 0;

        const statusesInOrder = statuses.reverse();
        const withThreads = statusesInOrder.filter(
            (status, index) => status.in_reply_to_id === null || (index > 0 && status.in_reply_to_id === statusesInOrder[index - 1].id)
        );

        for (const status of statusesInOrder) {
            const currentTimestampId = new Date(status.created_at).getTime();
            if (currentTimestampId > newTimestampId) {
                newTimestampId = currentTimestampId;
            }
        }

        let blueskyThread: BlueskyPostResponse[] = [];
        let lastBlueskyPost: BlueskyPostResponse | null = null;

        for (const status of withThreads) {
            const currentTimestampId = new Date(status.created_at).getTime();
            logger.debug("Evaluating status", { statusId: status.id, createdAt: status.created_at, currentTimestampId });

            if (currentTimestampId > lastProcessedPostId && lastProcessedPostId != 0) {
                try {
                    logger.info("Posting status to Bluesky", { statusId: status.id, createdAt: status.created_at });

                    const attachments = await loadAttachments(status);
                    if (status.in_reply_to_id !== null && lastBlueskyPost) {
                        blueskyThread = [...blueskyThread, lastBlueskyPost];
                    } else {
                        blueskyThread = [];
                    }

                    lastBlueskyPost = await bluesky.post(status.content, attachments, blueskyThread);
                } catch (error) {
                    logger.error("Posting to Bluesky failed", {
                        statusId: status.id,
                        createdAt: status.created_at,
                        currentTimestampId,
                        error
                    });
                }
            }
        }

        if (newTimestampId > 0) {
            lastProcessedPostId = newTimestampId;
            await saveLastProcessedPostId(lastProcessedPostId);
            logger.info("Persisted new last processed post marker", { lastProcessedPostId });
        }
    } catch (error) {
        logger.error("Main processing cycle failed", { error });
    }
}

(async () => {
    let isMainRunInProgress = false;

    try {
        await bluesky.login();
        await main();

        setInterval(async () => {
            if (isMainRunInProgress) {
                logger.warn("Skipping polling tick because previous cycle is still running");
                return;
            }

            isMainRunInProgress = true;
            try {
                await main();
            } finally {
                isMainRunInProgress = false;
            }
        }, intervalMinutes * 60 * 1000);
    } catch (error) {
        logger.error("Application startup failed", { error });
    }
})();
