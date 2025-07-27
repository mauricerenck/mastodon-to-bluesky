import he from "he";

// File to store the last processed Mastodon post ID
const lastProcessedPostIdFile = join(resolve(), "data", "lastProcessedPostId.txt");

/**
 * Load the last processed post ID from the file
 * @returns
 */
export const loadLastProcessedPostId = async () => {
    const value = await Deno.readTextFile(lastProcessedPostIdFile);
    return value.trim();
};

/**
 * Save the last processed post ID to the file
 */
export const saveLastProcessedPostId = (lastProcessedPostId) => {
    try {
        writeTextFileSync(lastProcessedPostIdFile, `${lastProcessedPostId}`);
    } catch (error) {
        console.error("Error saving last processed post ID:", error);
    }
};

export const splitText = (text, maxLength) => {
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
};

export const sanitizeHtml = (input) => {
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

export const urlToUint8Array = async (url) => {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const arrayBuffer = response.data;
    return new Uint8Array(arrayBuffer);
};
