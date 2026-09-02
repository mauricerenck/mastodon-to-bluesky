import "dotenv/config";
import * as bluesky from "./bluesky/index.js";
import * as mastodon from "./mastodon/index.js";
import { getIntegerEnv } from "./config.js";
import { logger } from "./logger.js";
import { buildConsecutiveThreadPlan } from "./threading.js";
import type { BlueskyThreadReference } from "./bluesky/types.js";
import {
    loadAttachments,
    loadLastProcessedPostId,
    loadThreadState,
    saveLastProcessedPostId,
    saveThreadState
} from "./utils.js";

const intervalMinutes = getIntegerEnv("INTERVAL_MINUTES", {
    defaultValue: 5,
    min: 1,
    max: 1440
});
logger.info("Configured polling interval", { intervalMinutes });

async function main() {
    try {
        const lastProcessedPostId = await loadLastProcessedPostId();
        logger.info("Loaded last processed post marker", { lastProcessedPostId });

        const statuses = await mastodon.fetchNewToots();
        logger.info("Fetched Mastodon statuses", { count: statuses.length });

        const threadState = await loadThreadState();

        const threadPlan = buildConsecutiveThreadPlan(statuses);
        const statusesInOrder = [...statuses].reverse();

        let newestTimestamp = 0;
        for (const status of statusesInOrder) {
            const currentTimestampId = new Date(status.created_at).getTime();
            if (currentTimestampId > newestTimestamp) {
                newestTimestamp = currentTimestampId;
            }
        }

        if (lastProcessedPostId === 0) {
            if (newestTimestamp > 0) {
                await saveLastProcessedPostId(newestTimestamp);
                logger.info("Persisted new last processed post marker", { lastProcessedPostId: newestTimestamp });
            }
            return;
        }

        let lastSuccessfulTimestamp = lastProcessedPostId;
        let processingFailed = false;

        for (const { status, continuesThread } of threadPlan) {
            const currentTimestampId = new Date(status.created_at).getTime();
            logger.debug("Evaluating status", {
                statusId: status.id,
                createdAt: status.created_at,
                currentTimestampId
            });

            if (currentTimestampId <= lastProcessedPostId) {
                continue;
            }

            if (threadState[status.id]) {
                lastSuccessfulTimestamp = Math.max(lastSuccessfulTimestamp, currentTimestampId);
                continue;
            }

            let threadReference: BlueskyThreadReference | undefined;
            if (continuesThread) {
                const parentStatusId = status.in_reply_to_id;
                threadReference = parentStatusId ? threadState[parentStatusId] : undefined;

                if (!threadReference) {
                    logger.warn("Skipping status because its Bluesky thread parent is unavailable", {
                        statusId: status.id,
                        parentStatusId
                    });
                    processingFailed = true;
                    break;
                }
            }

            try {
                logger.info("Posting status to Bluesky", { statusId: status.id, createdAt: status.created_at });

                const attachments = await loadAttachments(status);
                const postResult = threadReference
                    ? await bluesky.post(status.content, attachments, threadReference)
                    : await bluesky.post(status.content, attachments);

                threadState[status.id] = postResult;
                await saveThreadState(threadState);
                lastSuccessfulTimestamp = Math.max(lastSuccessfulTimestamp, currentTimestampId);
            } catch (error) {
                logger.error("Posting to Bluesky failed", {
                    statusId: status.id,
                    createdAt: status.created_at,
                    currentTimestampId,
                    error
                });
                processingFailed = true;
                break;
            }
        }

        const targetTimestamp = processingFailed
            ? lastSuccessfulTimestamp
            : Math.max(lastSuccessfulTimestamp, newestTimestamp);
        if (targetTimestamp > lastProcessedPostId) {
            await saveLastProcessedPostId(targetTimestamp);
            logger.info("Persisted new last processed post marker", { lastProcessedPostId: targetTimestamp });
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

        setInterval(
            async () => {
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
            },
            intervalMinutes * 60 * 1000
        );
    } catch (error) {
        logger.error("Application startup failed", { error });
    }
})();
