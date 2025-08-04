import { RichText, AtpAgent } from "@atproto/api";
import type { Attachment } from "./mastodonTypes.ts";
import { urlToUint8Array } from "./utils.ts";

const loginToBluesky = async (): Promise<AtpAgent> => {
    const blueskyUrl = Deno.env.get("BLUESKY_ENDPOINT");
    if (!blueskyUrl) throw new Error("BLUESKY_ENDPOINT not set");

    const agent = new AtpAgent({ service: blueskyUrl });
    const blueskyHandle = Deno.env.get("BLUESKY_HANDLE");
    if (!blueskyHandle) throw new Error("BLUESKY_HANDLE");

    const blueskyPassword = Deno.env.get("BLUESKY_PASSWORD");
    if (!blueskyPassword) throw new Error("BLUESKY_PASSWORD");

    try {
        const response = await agent.login({
            identifier: blueskyHandle,
            password: blueskyPassword
        });
        if (!response.success) throw new Error("login failed");

        console.log("🔒 Successfully logged in to Bluesky");
        return agent;
    } catch (error) {
        console.error("🔒 Login to Bluesky failed:", error);
        throw error;
    }
};

const agent = await loginToBluesky();

const createBlueskyMessage = async (text: string) => {
    const richText = new RichText({ text });
    await richText.detectFacets(agent);

    return {
        text: richText.text,
        facets: richText.facets
    };
};

export const postToBluesky = async (textParts: string[], attachments: Attachment[]) => {
    const images = attachments.filter((attachment) => attachment.type === "image");
    //const videos = attachments.filter((attachment) => attachment.medium === "video");

    // upload images first
    for (const image of images) {
        const imageContent = await urlToUint8Array(image.url);
        const { data } = await agent.uploadBlob(imageContent, { encoding: image.type });

        image.blob = data.blob;
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
};
