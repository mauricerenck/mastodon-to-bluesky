import "dotenv/config";
import * as bluesky from "./bluesky/index.js";
import * as mastodon from "./mastodon/index.js";
import { getIntegerEnv } from "./config.js";
import { logger } from "./logger.js";
import { buildConsecutiveThreadPlan } from "./threading.js";
import type { BlueskyThreadReference } from "./bluesky/types.js";
import type { ProcessedPostMarker } from "./utils.js";
import {
    compareProcessedPostMarkers,
    getProcessedPostMarker,
    loadAttachments,
    loadLastProcessedMarker,
    loadThreadState,
    saveLastProcessedMarker,
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
        const lastProcessedMarker = await loadLastProcessedMarker();
        logger.info("Loaded last processed post marker", { lastProcessedMarker });

        const statuses = await mastodon.fetchNewToots();
        logger.info("Fetched Mastodon statuses", { count: statuses.length });

        const threadState = await loadThreadState();
        const threadPlan = buildConsecutiveThreadPlan(statuses);
        const statusesInOrder = [...statuses].reverse();

        let newestMarker: ProcessedPostMarker = { createdAt: 0, id: null };
        for (const status of statusesInOrder) {
            const currentMarker = getProcessedPostMarker(status);
            if (compareProcessedPostMarkers(currentMarker, newestMarker) > 0) {
                newestMarker = currentMarker;
            }
        }

        if (lastProcessedMarker.createdAt === 0 && lastProcessedMarker.id === null) {
            if (newestMarker.createdAt > 0) {
                await saveLastProcessedMarker(newestMarker);
                logger.info("Persisted new last processed post marker", { lastProcessedMarker: newestMarker });
            }
            return;
        }

        let lastSuccessfulMarker = lastProcessedMarker;
        let processingFailed = false;

        for (const { status, continuesThread } of threadPlan) {
            const currentMarker = getProcessedPostMarker(status);
            logger.debug("Evaluating status", {
                statusId: status.id,
                createdAt: status.created_at,
                currentMarker
            });

            if (compareProcessedPostMarkers(currentMarker, lastProcessedMarker) <= 0) {
                continue;
            }

            if (threadState[status.id]) {
                if (compareProcessedPostMarkers(currentMarker, lastSuccessfulMarker) > 0) {
                    lastSuccessfulMarker = currentMarker;
                }
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
                if (compareProcessedPostMarkers(currentMarker, lastSuccessfulMarker) > 0) {
                    lastSuccessfulMarker = currentMarker;
                }
            } catch (error) {
                logger.error("Posting to Bluesky failed", {
                    statusId: status.id,
                    createdAt: status.created_at,
                    currentMarker,
                    error
                });
                processingFailed = true;
                break;
            }
        }

        const targetMarker =
            processingFailed || compareProcessedPostMarkers(lastSuccessfulMarker, newestMarker) >= 0
                ? lastSuccessfulMarker
                : newestMarker;
        if (compareProcessedPostMarkers(targetMarker, lastProcessedMarker) > 0) {
            await saveLastProcessedMarker(targetMarker);
            logger.info("Persisted new last processed post marker", { lastProcessedMarker: targetMarker });
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
