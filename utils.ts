import { join, resolve } from "https://deno.land/std/path/mod.ts";

// File to store the last processed Mastodon post ID
const lastProcessedPostIdFile = join(resolve(), "data", "lastProcessedPostId.txt");

/**
 * Load the last processed post ID from the file
 * @returns
 */
export const loadLastProcessedPostId = async (): Promise<number> => {
    const value = await Deno.readTextFile(lastProcessedPostIdFile);
    return parseInt(value.trim(), 10);
};

/**
 * Save the last processed post ID to the file
 */
export const saveLastProcessedPostId = async (lastProcessedPostId: number) => {
    try {
        await Deno.writeTextFile(lastProcessedPostIdFile, `${lastProcessedPostId}`);
    } catch (error) {
        console.error("Error saving last processed post ID:", error);
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
    const decodeQuotes = he.decode(withoutHtml);
    const addSpace = decodeQuotes.replace(/(https?:\/\/)/g, " $1");

    return addSpace;
};

export const loadAttachments = (item) =>
    Array.from(item.getElementsByTagName("media:content")).reduce((list, item) => {
        const url = item.getAttribute("url");
        const mimeType = item.getAttribute("type");
        const medium = item.getAttribute("medium"); // image or video
        const descriptionItems = item.getElementsByTagName("media:description");
        const altText = descriptionItems.length === 0 ? "" : descriptionItems[0].textContent;

        if (!["video", "image"].includes(medium)) return list;

        return [
            ...list,
            {
                url,
                altText,
                mimeType,
                medium
            }
        ];
    }, []);

export const urlToUint8Array = async (url: string) => {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
};
