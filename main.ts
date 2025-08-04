import { loginToBluesky, postToBluesky } from "./bluesky.ts";
import { fetchNewToots } from "./mastodon.ts";
import { loadAttachments, loadLastProcessedPostId, sanitizeHtml, saveLastProcessedPostId, splitText } from "./utils.ts";

if (!import.meta.main) {
    console.error("This script is intended to be run directly, not imported.");
    Deno.exit(1);
}

const intervalMinutes = parseInt(Deno.env.get("INTERVAL_MINUTES") ?? "5");

try {
    // Variable to store the last processed Mastodon post ID
    let lastProcessedPostId = await loadLastProcessedPostId();

    const agent = await loginToBluesky();

    while (true) {
        const statuses = await fetchNewToots();

        let newTimestampId = 0;

        for (const status of statuses.reverse()) {
            const currentTimestampId = Date.parse(status.created_at);
            if (currentTimestampId > newTimestampId) newTimestampId = currentTimestampId;

            if (currentTimestampId > lastProcessedPostId && lastProcessedPostId != 0) {
                try {
                    console.log("📧 posting to BlueSky", currentTimestampId);

                    const contentParts = splitText(sanitizeHtml(status.content), 300);
                    const attachments = loadAttachments(status);

                    postToBluesky(contentParts, attachments);
                } catch (error) {
                    console.error("🔥 can't post to Bluesky", currentTimestampId, error);
                }
            }
        }

        if (newTimestampId > 0) {
            lastProcessedPostId = newTimestampId;
            saveLastProcessedPostId(lastProcessedPostId);
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMinutes * 60 * 1000));
    }
} catch (error) {
    console.error(error);
    Deno.exit(1);
}
