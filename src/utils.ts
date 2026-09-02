import fs from "fs/promises";
import path from "path";
import sanitize from "sanitize-html";
import type { Status, Attachment } from "./mastodon/types.js";
import type { BlueskyThreadReference } from "./bluesky/types.js";
import { logger } from "./logger.js";

// File to store the last processed Mastodon post marker
const lastProcessedPostIdFile = path.join(path.resolve(), "data", "lastProcessedPostId.txt");
const threadStateFile = path.join(path.resolve(), "data", "threadState.json");
const dataDirectory = path.dirname(lastProcessedPostIdFile);

export type ProcessedPostMarker = {
    createdAt: number;
    id: string | null;
};

export type BlueskyThreadState = Record<string, BlueskyThreadReference>;

/**
 * Load the last processed Mastodon post marker.
 * @returns
 */
export const loadLastProcessedMarker = async (): Promise<ProcessedPostMarker> => {
    try {
        const value = await fs.readFile(lastProcessedPostIdFile, "utf-8");
        const trimmedValue = value.trim();

        if (/^\d+$/.test(trimmedValue)) {
            const legacyCreatedAt = Number(trimmedValue);
            if (!Number.isSafeInteger(legacyCreatedAt)) {
                throw new Error(`Invalid value in ${lastProcessedPostIdFile}: "${trimmedValue}"`);
            }

            const migratedMarker: ProcessedPostMarker = {
                createdAt: legacyCreatedAt,
                id: null
            };
            await writeProcessedPostMarker(migratedMarker);
            logger.info("Migrated legacy processed post marker", {
                file: lastProcessedPostIdFile,
                createdAt: legacyCreatedAt
            });
            return migratedMarker;
        }

        let parsedValue: unknown;
        try {
            parsedValue = JSON.parse(trimmedValue) as unknown;
        } catch {
            throw new Error(`Invalid value in ${lastProcessedPostIdFile}: "${trimmedValue}"`);
        }

        if (!isProcessedPostMarker(parsedValue)) {
            throw new Error(`Invalid value in ${lastProcessedPostIdFile}: "${trimmedValue}"`);
        }

        return parsedValue;
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== "ENOENT") {
            throw error;
        }

        await writeProcessedPostMarker({ createdAt: 0, id: null });
        logger.info("Initialized missing state file", { file: lastProcessedPostIdFile });
        return { createdAt: 0, id: null };
    }
};

/**
 * Save the last processed Mastodon post marker.
 */
export const saveLastProcessedMarker = async (marker: ProcessedPostMarker) => {
    try {
        await writeProcessedPostMarker(marker);
    } catch (error) {
        logger.error("Failed to persist processed post marker", { marker, error });
        throw error;
    }
};

export const getProcessedPostMarker = (status: Pick<Status, "created_at" | "id">): ProcessedPostMarker => ({
    createdAt: new Date(status.created_at).getTime(),
    id: status.id
});

export const compareProcessedPostMarkers = (left: ProcessedPostMarker, right: ProcessedPostMarker): number => {
    if (left.createdAt !== right.createdAt) {
        return left.createdAt < right.createdAt ? -1 : 1;
    }

    if (left.id === right.id) {
        return 0;
    }

    // A legacy marker has no ID and is treated as the end of its timestamp.
    if (left.id === null) {
        return 1;
    }
    if (right.id === null) {
        return -1;
    }

    return comparePostIds(left.id, right.id);
};

async function writeProcessedPostMarker(marker: ProcessedPostMarker) {
    await fs.mkdir(dataDirectory, { recursive: true });
    await fs.writeFile(lastProcessedPostIdFile, JSON.stringify(marker), "utf-8");
}

function isProcessedPostMarker(value: unknown): value is ProcessedPostMarker {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const marker = value as { createdAt?: unknown; id?: unknown };
    return (
        typeof marker.createdAt === "number" &&
        Number.isSafeInteger(marker.createdAt) &&
        marker.createdAt >= 0 &&
        (typeof marker.id === "string" || marker.id === null)
    );
}

function comparePostIds(left: string, right: string): number {
    if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
        const leftNumber = BigInt(left);
        const rightNumber = BigInt(right);
        return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
    }

    return left < right ? -1 : 1;
}

export const loadThreadState = async (): Promise<BlueskyThreadState> => {
    try {
        const value = await fs.readFile(threadStateFile, "utf-8");
        const parsedValue = JSON.parse(value) as unknown;

        if (!isBlueskyThreadState(parsedValue)) {
            throw new Error(`Invalid value in ${threadStateFile}`);
        }

        return parsedValue;
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== "ENOENT") {
            throw error;
        }

        await fs.mkdir(dataDirectory, { recursive: true });
        await fs.writeFile(threadStateFile, "{}", "utf-8");
        logger.info("Initialized missing thread state file", { file: threadStateFile });
        return {};
    }
};

export const saveThreadState = async (threadState: BlueskyThreadState) => {
    try {
        await fs.mkdir(dataDirectory, { recursive: true });
        await fs.writeFile(threadStateFile, JSON.stringify(threadState, null, 2), "utf-8");
    } catch (error) {
        logger.error("Failed to persist thread state", { entries: Object.keys(threadState).length, error });
        throw error;
    }
};

function isBlueskyPostReference(value: unknown): value is { uri: string; cid: string } {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const reference = value as { uri?: unknown; cid?: unknown };
    return typeof reference.uri === "string" && typeof reference.cid === "string";
}

function isBlueskyThreadState(value: unknown): value is BlueskyThreadState {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }

    return Object.values(value).every((entry) => {
        if (typeof entry !== "object" || entry === null) {
            return false;
        }

        const thread = entry as { root?: unknown; parent?: unknown };
        return isBlueskyPostReference(thread.root) && isBlueskyPostReference(thread.parent);
    });
}

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
