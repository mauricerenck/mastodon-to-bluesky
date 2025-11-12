import "dotenv/config";
import { postToBluesky } from "./bluesky";
import { fetchNewToots } from "./mastodon/mastodon";
import { loadAttachments, loadLastProcessedPostId, sanitizeHtml, saveLastProcessedPostId, splitText } from "./utils";

const intervalMinutes = parseInt(process.env.INTERVAL_MINUTES ?? "5");
console.log("⏱️", `${intervalMinutes} minutes`);

async function main() {
    try {
        // Variable to store the last processed Mastodon post ID
        let lastProcessedPostId = await loadLastProcessedPostId();
        console.log("📅", lastProcessedPostId);

        while (true) {
            try {
                const statuses = await fetchNewToots();
                console.log("🦢", `load ${statuses.length} toots`);

                let newTimestampId = 0;

                for (const status of statuses.reverse()) {
                    const currentTimestampId = new Date(status.created_at).getTime();
                    console.log("🐛", status.created_at, currentTimestampId);

                    if (currentTimestampId > newTimestampId) newTimestampId = currentTimestampId;

                    if (currentTimestampId > lastProcessedPostId && lastProcessedPostId != 0) {
                        try {
                            console.log("📧 posting to BlueSky", status.id, status.created_at);

                            const contentParts = splitText(sanitizeHtml(status.content), 300);
                            const attachments = loadAttachments(status);

                            postToBluesky(contentParts, attachments);
                        } catch (error) {
                            console.error(
                                "🔥 can't post to Bluesky",
                                status.id,
                                status.created_at,
                                currentTimestampId,
                                error
                            );
                        }
                    }
                }

                if (newTimestampId > 0) {
                    lastProcessedPostId = newTimestampId;
                    saveLastProcessedPostId(lastProcessedPostId);
                }
            } catch (error) {
                console.error("🔥", error);
            }
        }
    } catch (error) {
        console.error(error);
    }
}

main().then(() => {
    setInterval(async () => {
        await main();
    }, intervalMinutes * 60 * 1000);
});
