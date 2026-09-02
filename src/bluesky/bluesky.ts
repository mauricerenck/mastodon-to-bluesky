import { RichText, AtpAgent } from "@atproto/api";
import { getIntegerEnv } from "../config.js";
import { logger } from "../logger.js";
import type { Attachment } from "../mastodon/types.js";
import { sanitizeHtml, splitText, urlToUint8Array } from "../utils.js";
import type { BlueskyThreadReference, BlueSkySettings } from "./types.js";

let settings: BlueSkySettings = null!;
let agent: AtpAgent = null!;
type BlueskyPostResponse = Awaited<ReturnType<AtpAgent["post"]>>;
type BlueskyMessage = Awaited<ReturnType<typeof createBlueskyMessage>> & { reply?: BlueskyThreadReference };

export const resetCache = () => {
    settings = null!;
    agent = null!;
};

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

    const maxPostLength = getIntegerEnv("BLUESKY_MAX_POST_LENGTH", {
        defaultValue: 300,
        min: 50,
        max: 3000
    });

    return {
        url,
        handle,
        password,
        maxPostLength
    } as BlueSkySettings;
}

export const post = async (
    message: string,
    attachments: readonly Attachment[],
    blueskyThread?: BlueskyThreadReference
): Promise<BlueskyThreadReference> => {
    const messageParts = splitText(sanitizeHtml(message), settings.maxPostLength);
    const uploadedImages = await uploadImages(attachments);

    let rootMessage: BlueskyMessage = await createBlueskyMessage(messageParts[0]);
    if (blueskyThread) {
        rootMessage = {
            ...rootMessage,
            reply: {
                root: blueskyThread.root,
                parent: blueskyThread.parent
            }
        };
    }

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

    let parentMessageResponse = rootMessageResponse;
    for (let index = 1; index < messageParts.length; index++) {
        const replyMessage = await createBlueskyMessage(messageParts[index]);
        parentMessageResponse = await agent.post({
            ...replyMessage,
            reply: {
                root: blueskyThread?.root ?? rootMessageResponse,
                parent: parentMessageResponse
            }
        });
    }

    return {
        root: blueskyThread?.root ?? rootMessageResponse,
        parent: parentMessageResponse
    };
};

async function loginInternal(url: string, handle: string, password: string): Promise<AtpAgent> {
    const agent = new AtpAgent({ service: url });

    try {
        const response = await agent.login({
            identifier: handle,
            password: password
        });
        if (!response.success) throw new Error("login failed");

        logger.info("Successfully logged in to Bluesky", { handle });
        return agent;
    } catch (error) {
        logger.error("Login to Bluesky failed", { handle, error });
        throw error;
    }
}

async function uploadImages(attachments: readonly Attachment[]) {
    const images = attachments.filter((attachment) => attachment.type === "image");
    const uploadedImages = [] as Attachment[];

    for (const image of images) {
        if (!image.mimeType) {
            logger.warn("Skipping image upload without mime-type", { url: image.url });
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
            logger.error("Image upload failed", { url: image.url, error: err });
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
