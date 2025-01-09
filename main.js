import "dotenv/config";
import { RichText, AtpAgent } from "@atproto/api";
import axios from "axios";
import { DOMParser } from "xmldom";
import {
    loadAttachments,
    loadLastProcessedPostId,
    sanitizeHtml,
    saveLastProcessedPostId,
    splitText,
    urlToUint8Array
} from "./utils.js";

async function main() {
    // Bluesky agent
    const agent = new AtpAgent({ service: process.env.BLUESKY_ENDPOINT });
    try {
        const loginResponse = await agent.login({
            identifier: process.env.BLUESKY_HANDLE,
            password: process.env.BLUESKY_PASSWORD
        });
        if (!loginResponse.success) throw new Error("login failed");
    } catch {
        console.error("🔒 login failed");
        return;
    }

    // Variable to store the last processed Mastodon post ID
    let lastProcessedPostId = loadLastProcessedPostId();

    async function createBlueskyMessage(text, images) {
        const richText = new RichText({ text });
        await richText.detectFacets(agent);

        return {
            text: richText.text,
            facets: richText.facets
        };
    }

    async function postToBluesky(textParts, attachments) {
        const images = attachments.filter((attachment) => attachment.medium === "image");
        //const videos = attachments.filter((attachment) => attachment.medium === "video");

        // upload images first
        for (let i = 0; i < images.length; i++) {
            const image = images[i];

            const imageContent = await urlToUint8Array(image.url);
            const { data } = await agent.uploadBlob(imageContent, { encoding: image.mimeType });

            images[i].blob = data.blob;
        }

        const rootMessage = await createBlueskyMessage(textParts[0]);
        const embedPart =
            images.length === 0
                ? {}
                : {
                      embed: {
                          images: images.map((image) => ({
                              alt: image.altText,
                              image: image.blob
                          })),
                          $type: "app.bsky.embed.images"
                      }
                  };
        const rootMessageResponse = await agent.post({
            ...rootMessage,
            ...embedPart
        });

        if (textParts.length === 1) return;

        let replyMessageResponse = null;
        for (let index = 1; index < textParts.length; index++) {
            const replyMessage = await createBlueskyMessage(textParts[index]);
            replyMessageResponse = await agent.post({
                ...replyMessage,
                reply: {
                    root: rootMessageResponse,
                    parent: replyMessageResponse ?? rootMessageResponse
                }
            });
        }
    }

    // Function to periodically fetch new Mastodon posts
    async function fetchNewToots() {
        const rssFeedURL = `${process.env.MASTODON_INSTANCE}/users/${process.env.MASTODON_USER}.rss`;

        try {
            const response = await axios.get(rssFeedURL);
            const xmlData = response.data;
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlData, "application/xml");
            const items = doc.getElementsByTagName("item");

            let newTimestampId = 0;

            for (let i = items.length - 1; i >= 0; i--) {
                const item = items[i];

                const currentTimestampId = Date.parse(
                    item.getElementsByTagName("pubDate")[0].textContent.split(",").pop()
                );

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
    }

    fetchNewToots();

    // Fetch new posts every 5 minutes (adjust as needed)
    //setInterval(fetchNewToots, (process.env.INTERVAL_MINUTES ?? 5) * 60 * 1000);
}

main();
