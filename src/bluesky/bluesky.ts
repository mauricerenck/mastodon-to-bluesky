import { RichText, AtpAgent } from "@atproto/api";
import type { Attachment } from "../mastodon/types.js";
import { sanitizeHtml, splitText, urlToUint8Array } from "../utils.js";
import type { BlueSkySettings } from "./types.js";

let settings: BlueSkySettings = null!;
let agent: AtpAgent = null!;

export const login = async () => {
    if (!settings) {
        settings = loadSettings();
    }

    if (agent) {
        return agent;
    }

    const { url, handle, password } = settings;
    agent = await loginInternal(url, handle, password);
};

function loadSettings() {
    const url = process.env.BLUESKY_ENDPOINT;
    if (!url) throw new Error("BLUESKY_ENDPOINT not set");

    const handle = process.env.BLUESKY_HANDLE;
    if (!handle) throw new Error("BLUESKY_HANDLE");

    const password = process.env.BLUESKY_PASSWORD;
    if (!password) throw new Error("BLUESKY_PASSWORD");

    const maxPostLength = parseInt(process.env.BLUESKY_MAX_POST_LENGTH ?? "300");

    return {
        url,
        handle,
        password,
        maxPostLength
    } as BlueSkySettings;
}

export const post = async (message: string, attachments: Attachment[]) => {
    const messageParts = splitText(sanitizeHtml(message), settings.maxPostLength);
    const uploadedImages = await uploadImages(attachments);

    const rootMessage = await createBlueskyMessage(messageParts[0]);
    const embedPart =
        uploadedImages.length === 0
            ? {}
            : {
                  embed: {
                      images: uploadedImages.map((image) => ({
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

    if (messageParts.length === 1) {
        return;
    }

    let replyMessageResponse = null;
    for (let index = 1; index < messageParts.length; index++) {
        const replyMessage = await createBlueskyMessage(messageParts[index]);
        replyMessageResponse = await agent.post({
            ...replyMessage,
            reply: {
                root: rootMessageResponse,
                parent: replyMessageResponse ?? rootMessageResponse
            }
        });
    }
};

async function loginInternal(url: string, handle: string, password: string): Promise<AtpAgent> {
    const agent = new AtpAgent({ service: url });

    try {
        const response = await agent.login({
            identifier: handle,
            password: password
        });
        if (!response.success) throw new Error("login failed");

        console.log("🔒 Successfully logged in to Bluesky");
        return agent;
    } catch (error) {
        console.error("🔒 Login to Bluesky failed:", error);
        throw error;
    }
}

async function uploadImages(attachments: Attachment[]) {
    const images = attachments.filter((attachment) => attachment.type === "image");
    const uploadedImages = [] as Attachment[];

    for (const image of images) {
        if (!image.mimeType) {
            console.log("skip image without mime-type", image.url);
            continue;
        }

        try {
            const imageContent = await urlToUint8Array(image.url);
            const { success, data } = await agent.uploadBlob(imageContent, { encoding: image.mimeType });

            if (!success) {
                continue;
            }

            uploadedImages.push({
                ...image,
                blob: data.blob
            });
        } catch (err) {
            console.error("can't upload image", image.url, err);
        }
    }

    return uploadedImages;
}

async function createBlueskyMessage(text: string) {
    const richText = new RichText({ text });
    await richText.detectFacets(agent);

    return {
        text: richText.text,
        facets: richText.facets
    };
}
