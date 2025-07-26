import type { Account, Status } from "./mastodonTypes.ts";

// Function to periodically fetch new Mastodon posts
export const fetchNewToots = async (lastProcessedPostId: string) => {
    const instance = Deno.env.get("MASTODON_INSTANCE");
    if (!instance) throw new Error("MASTODON_INSTANCE environment variable is not set.");

    const mastodonUser = Deno.env.get("MASTODON_USER");
    if (!mastodonUser) throw new Error("MASTODON_USER environment variable is not set.");

    try {
        const accountApiURL = `${instance}/api/v1/accounts/lookup?acct=${mastodonUser}`;
        const response = await fetch(accountApiURL);
        const account = (await response.json()) as Account;
        const userId = account.id;

        const statusApiUrl = `${instance}/api/v1/accounts/${userId}/statuses`;
        const statusResponse = await fetch(statusApiUrl);
        const statuses = (await response.json()) as Status[];

        let newTimestampId = 0;

        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];

            const currentTimestampId = Date.parse(item.getElementsByTagName("pubDate")[0].textContent.split(",").pop());

            if (currentTimestampId > newTimestampId) {
                newTimestampId = currentTimestampId;
            }

            if (currentTimestampId > lastProcessedPostId && lastProcessedPostId != 0) {
                try {
                    console.log("📧 posting to BlueSky", currentTimestampId);

                    const id = item.getElementsByTagName("guid")[0].textContent.split("/").pop();
                    const rawContent = item.getElementsByTagName("description")[0].textContent;
                    const contentParts = splitText(sanitizeHtml(rawContent), 300);
                    const attachments = loadAttachments(item);

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
    } catch (e) {
        console.log(`getting toots for ${mastodonUser} returned an error`);
        return "";
    }
};
