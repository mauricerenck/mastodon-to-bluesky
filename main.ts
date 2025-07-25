import { loginToBluesky } from "./bluesky.ts";
import { loadLastProcessedPostId } from "./utils.ts";

if (!import.meta.main) {
    console.error("This script is intended to be run directly, not imported.");
    Deno.exit(1);
}

try {
    const agent = await loginToBluesky();
    console.log("🔒 Successfully logged in to Bluesky");
    // You can now use the agent to interact with the Bluesky API
} catch (error) {
    console.error("🔒 Error during login:", error);
    Deno.exit(1);
}

// Variable to store the last processed Mastodon post ID
let lastProcessedPostId = await loadLastProcessedPostId();

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

fetchNewToots();

// Fetch new posts every 5 minutes (adjust as needed)
setInterval(fetchNewToots, (process.env.INTERVAL_MINUTES ?? 5) * 60 * 1000);
