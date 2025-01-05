require("dotenv").config();
const fs = require("fs");
const he = require("he");
const path = require("path");
const { RichText, AtpAgent } = require("@atproto/api");
const axios = require("axios");
const { DOMParser } = require("xmldom");

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

    // File to store the last processed Mastodon post ID
    const lastProcessedPostIdFile = path.join(__dirname, "data", "lastProcessedPostId.txt");

    // Variable to store the last processed Mastodon post ID
    let lastProcessedPostId = loadLastProcessedPostId();

    // Function to load the last processed post ID from the file
    function loadLastProcessedPostId() {
        try {
            return fs.readFileSync(lastProcessedPostIdFile, "utf8").trim();
        } catch (error) {
            console.error("Error loading last processed post ID:", error);
            return null;
        }
    }

    // Function to save the last processed post ID to the file
    function saveLastProcessedPostId() {
        try {
            fs.writeFileSync(lastProcessedPostIdFile, `${lastProcessedPostId}`);
        } catch (error) {
            console.error("Error saving last processed post ID:", error);
        }
    }

    async function createBlueskyMessage(text) {
        const richText = new RichText({ text });
        await richText.detectFacets(agent);

        return {
            text: richText.text,
            facets: richText.facets
        };
    }

    async function postToBluesky(textParts) {
        const rootMessageResponse = await agent.post(await createBlueskyMessage(textParts[0]));

        if (textParts.length === 1) return;

        let replyMessageResponse = null;
        for (let index = 1; index < textParts.length; index++) {
            replyMessageResponse = await agent.post({
                ...(await createBlueskyMessage(textParts[index])),
                reply: {
                    root: rootMessageResponse,
                    parent: replyMessageResponse ?? rootMessageResponse
                }
            });
        }
    }

    function sanitizeHtml(input) {
        const withLinebreaks = input
            .replace(/<br \/>/g, "\r\n")
            .replace(/<\/p>/g, "\r\n\n")
            .replace(/<p>/g, "");
        const withoutHtml = withLinebreaks.replace(/<[^>]*>/g, "");
        const decodeQuotes = he.decode(withoutHtml);
        const addSpace = decodeQuotes.replace(/(https?:\/\/)/g, " $1");

        return addSpace;
    }

    function splitText(text, maxLength) {
        // Split the text by spaces
        const words = text.split(" ");

        let result = [];
        let currentChunk = "";

        for (const word of words) {
            // Add the current word to the current chunk
            const potentialChunk = `${currentChunk} ${word}`.trim();

            if (potentialChunk.length <= maxLength) {
                // If the current chunk is still under max length, add the word
                currentChunk = potentialChunk;
            } else {
                // Otherwise, add the current chunk to the result and start a new chunk
                result.push(currentChunk);
                currentChunk = word;
            }
        }

        // Add the last chunk to the result
        result.push(currentChunk);

        return result;
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

                        //postToBluesky(textParts);
                        console.log("🦒", id, currentTimestampId, contentParts);
                    } catch (error) {
                        console.error("🔥 can't post to Bluesky", currentTimestampId, error);
                    }
                }
            }

            if (newTimestampId > 0) {
                lastProcessedPostId = newTimestampId;
                saveLastProcessedPostId();
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
