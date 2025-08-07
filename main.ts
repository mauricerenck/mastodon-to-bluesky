import { postToBluesky } from "./bluesky.ts";
import { fetchNewToots } from "./mastodon.ts";
import { loadAttachments, loadLastProcessedPostId, sanitizeHtml, saveLastProcessedPostId, splitText } from "./utils.ts";

if (!import.meta.main) {
    console.error("This script is intended to be run directly, not imported.");
    Deno.exit(1);
}

const intervalMinutes = parseInt(Deno.env.get("INTERVAL_MINUTES") ?? "5");
console.log("⏱️", `${intervalMinutes} minutes`);

try {
    // Variable to store the last processed Mastodon post ID
    let lastProcessedPostId = await loadLastProcessedPostId();
    console.log("📅", lastProcessedPostId);

    while (true) {
        try {
            const statuses = await fetchNewToots(lastProcessedPostId);
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

        await new Promise((resolve) => setTimeout(resolve, intervalMinutes * 60 * 1000));
    }
} catch (error) {
    console.error(error);
    Deno.exit(1);
}
