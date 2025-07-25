import axios from "axios";
import { DOMParser } from "xmldom";

// Function to periodically fetch new Mastodon posts
export const fetchNewToots = async () => {
    const rssFeedURL = `${Deno.env.get("MASTODON_INSTANCE")}/users/${Deno.env.get("MASTODON_USER")}.rss`;

    try {
        const response = await axios.get(rssFeedURL);
        const xmlData = response.data;
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlData, "application/xml");
        const items = doc.getElementsByTagName("item");

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
        console.log(`getting toots for ${process.env.MASTODON_USER} returned an error`);
        return "";
    }
};
