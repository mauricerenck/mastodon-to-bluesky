import type { Account, Status } from "./mastodonTypes.ts";

/**
 * periodically fetch new Mastodon posts
 * @param lastProcessedPostId
 * @returns
 */
export const fetchNewToots = async (lastProcessedPostId: string) => {
    const instanceUrl = Deno.env.get("MASTODON_INSTANCE");
    if (!instanceUrl) throw new Error("MASTODON_INSTANCE environment variable is not set.");

    const mastodonUser = Deno.env.get("MASTODON_USER");
    if (!mastodonUser) throw new Error("MASTODON_USER environment variable is not set.");

    try {
        const account = await getAccountByUsername(instanceUrl, mastodonUser);
        const statuses = await getStatuses(instanceUrl, account.id);

        let newTimestampId = 0;

        for (const status of statuses) {
            const currentTimestampId = Date.parse(status.created_at);
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

        /*
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
        */

        if (newTimestampId > 0) {
            lastProcessedPostId = newTimestampId;
            saveLastProcessedPostId(lastProcessedPostId);
        }
    } catch (e) {
        console.log(`getting toots for ${mastodonUser} returned an error`);
        return "";
    }
};

const getAccountByUsername = async (instanceUrl: string, username: string) => {
    const accountApiURL = `${instanceUrl}/api/v1/accounts/lookup?acct=${username}`;
    const response = await fetch(accountApiURL);
    return (await response.json()) as Account;
};

const getStatuses = async (instanceUrl: string, accountId: string) => {
    const statusApiUrl = `${instanceUrl}/api/v1/accounts/${accountId}/statuses`;
    const response = await fetch(statusApiUrl);
    return (await response.json()) as Status[];
};
