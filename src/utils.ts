import fs from "fs/promises";
import path from "path";
import sanitize from "sanitize-html";
import type { Status, Attachment } from "./mastodon/types.js";
import { logger } from "./logger.js";

// File to store the last processed Mastodon post ID
const lastProcessedPostIdFile = path.join(path.resolve(), "data", "lastProcessedPostId.txt");
const dataDirectory = path.dirname(lastProcessedPostIdFile);

/**
 * Load the last processed post ID from the file
 * @returns
 */
export const loadLastProcessedPostId = async (): Promise<number> => {
    try {
        const value = await fs.readFile(lastProcessedPostIdFile, "utf-8");
        const parsedValue = parseInt(value.trim(), 10);

        if (Number.isNaN(parsedValue)) {
            throw new Error(`Invalid value in ${lastProcessedPostIdFile}: "${value.trim()}"`);
        }

        return parsedValue;
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== "ENOENT") {
            throw error;
        }

        await fs.mkdir(dataDirectory, { recursive: true });
        await fs.writeFile(lastProcessedPostIdFile, "0", "utf-8");
        logger.info("Initialized missing state file", { file: lastProcessedPostIdFile });
        return 0;
    }
};

/**
 * Save the last processed post ID to the file
 */
export const saveLastProcessedPostId = async (lastProcessedPostId: number) => {
    try {
        await fs.mkdir(dataDirectory, { recursive: true });
        await fs.writeFile(lastProcessedPostIdFile, `${lastProcessedPostId}`, "utf-8");
    } catch (error) {
        logger.error("Failed to persist last processed post ID", { lastProcessedPostId, error });
        throw error;
    }
};

export const splitText = (text: string, maxLength: number) => {
    // Split the text by spaces
    const words = text.split(" ");

    const result = [];
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
};

export const sanitizeHtml = (input: string) => {
    const withLinebreaks = input
        .replace(/<br \/>/g, "\r\n")
        .replace(/<\/p>/g, "\r\n\n")
        .replace(/<p>/g, "");
    const withoutHtml = withLinebreaks.replace(/<[^>]*>/g, "");
    const decodeQuotes = sanitize(withoutHtml) as string;
    const addSpace = decodeQuotes.replace(/(https?:\/\/)/g, " $1");

    return addSpace;
};

export const loadAttachments = async (status: Status) => {
    const validAttachments = status.media_attachments.filter((att) => ["video", "image"].includes(att.type));
    const attachmentPromises = validAttachments.map(async (attachment) => {
        const { url, type } = attachment;
        const mimeType = await getMimeType(url);

        return {
            url,
            type,
            mimeType,
            altText: attachment.description ?? null
        } as Attachment;
    });

    return await Promise.all(attachmentPromises);
};

export const urlToUint8Array = async (url: string) => {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
};

async function getMimeType(url: string) {
    try {
        const response = await fetch(url, { method: "HEAD" });

        if (response.ok) {
            return response.headers.get("Content-Type");
        } else {
            logger.warn("Failed to fetch mime-type: unexpected status", { url, status: response.status });
            return null;
        }
    } catch (error) {
        logger.error("Failed to fetch mime-type", { url, error });
        return null;
    }
}
