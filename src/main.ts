import "dotenv/config";
import * as bluesky from "./bluesky/index.js";
import * as mastodon from "./mastodon/index.js";
import { loadAttachments, loadLastProcessedPostId, saveLastProcessedPostId } from "./utils.js";

const intervalMinutes = parseInt(process.env.INTERVAL_MINUTES ?? "5");
console.log("⏱️", `${intervalMinutes} minutes`);

async function main() {
    type BlueskyPostResponse = Awaited<ReturnType<typeof bluesky.post>>;

    // Variable to store the last processed Mastodon post ID
    let lastProcessedPostId = await loadLastProcessedPostId();
    console.log("📅", lastProcessedPostId);

    try {
        const statuses = await mastodon.fetchNewToots();
        console.log("🦢", `load ${statuses.length} toots`);

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
            console.log("🐛", status.created_at, currentTimestampId);

            if (currentTimestampId > lastProcessedPostId && lastProcessedPostId != 0) {
                try {
                    console.log("📧 posting to BlueSky", status.id, status.created_at);

                    const attachments = await loadAttachments(status);
                    if (status.in_reply_to_id !== null && lastBlueskyPost) {
                        blueskyThread = [...blueskyThread, lastBlueskyPost];
                    } else {
                        blueskyThread = [];
                    }

                    lastBlueskyPost = await bluesky.post(status.content, attachments, blueskyThread);
                } catch (error) {
                    console.error("🔥 can't post to Bluesky", status.id, status.created_at, currentTimestampId, error);
                }
            }
        }

        if (newTimestampId > 0) {
            lastProcessedPostId = newTimestampId;
            await saveLastProcessedPostId(lastProcessedPostId);
        }
    } catch (error) {
        console.error("🔥", error);
    }
}

(async () => {
    try {
        await bluesky.login();
        await main();

        setInterval(async () => {
            await main();
        }, intervalMinutes * 60 * 1000);
    } catch (error) {
        console.error(error);
    }
})();
