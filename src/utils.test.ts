import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Status, MediaAttachment } from "./mastodon/types.js";

// --- Mock fs/promises ---
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock("fs/promises", () => ({
    default: {
        readFile: (...args: unknown[]) => mockReadFile(...args),
        writeFile: (...args: unknown[]) => mockWriteFile(...args)
    }
}));

import {
    loadLastProcessedPostId,
    saveLastProcessedPostId,
    splitText,
    sanitizeHtml,
    loadAttachments,
    urlToUint8Array
} from "./utils.js";

describe("utils", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ── loadLastProcessedPostId ──────────────────────────────────────

    describe("loadLastProcessedPostId", () => {
        it("should return the parsed post ID from file", async () => {
            mockReadFile.mockResolvedValue("123456\n");

            const result = await loadLastProcessedPostId();

            expect(result).toBe(123456);
            expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining("lastProcessedPostId.txt"), "utf-8");
        });

        it("should trim whitespace before parsing", async () => {
            mockReadFile.mockResolvedValue("  789  \n");

            const result = await loadLastProcessedPostId();

            expect(result).toBe(789);
        });

        it("should propagate error when file does not exist", async () => {
            mockReadFile.mockRejectedValue(new Error("ENOENT"));

            await expect(loadLastProcessedPostId()).rejects.toThrow("ENOENT");
        });
    });

    // ── saveLastProcessedPostId ──────────────────────────────────────

    describe("saveLastProcessedPostId", () => {
        it("should write the post ID to file", async () => {
            mockWriteFile.mockResolvedValue(undefined);

            await saveLastProcessedPostId(42);

            expect(mockWriteFile).toHaveBeenCalledWith(
                expect.stringContaining("lastProcessedPostId.txt"),
                "42",
                "utf-8"
            );
        });

        it("should not throw when write fails (logs error instead)", async () => {
            mockWriteFile.mockRejectedValue(new Error("EACCES"));

            // saveLastProcessedPostId catches the error internally
            await expect(saveLastProcessedPostId(42)).resolves.toBeUndefined();
        });
    });

    // ── splitText ────────────────────────────────────────────────────

    describe("splitText", () => {
        it("should return single chunk when text fits", () => {
            const result = splitText("Hello world", 300);

            expect(result).toEqual(["Hello world"]);
        });

        it("should split text into multiple chunks", () => {
            const result = splitText("aaa bbb ccc", 7);

            expect(result).toEqual(["aaa bbb", "ccc"]);
        });

        it("should handle exact boundary", () => {
            const result = splitText("abc def", 7);

            expect(result).toEqual(["abc def"]);
        });

        it("should split each word separately when maxLength is very small", () => {
            const result = splitText("aa bb cc", 2);

            expect(result).toEqual(["aa", "bb", "cc"]);
        });

        it("should handle empty string", () => {
            const result = splitText("", 10);

            expect(result).toEqual([""]);
        });

        it("should handle single word longer than maxLength", () => {
            const result = splitText("superlongword", 5);

            // The word exceeds maxLength, but currentChunk starts empty and gets pushed first
            expect(result).toEqual(["", "superlongword"]);
        });

        it("should split many words correctly", () => {
            const result = splitText("a b c d e f g", 3);

            expect(result).toEqual(["a b", "c d", "e f", "g"]);
        });
    });

    // ── sanitizeHtml ────────────────────────────────────────────────

    describe("sanitizeHtml", () => {
        it("should convert <br /> to line breaks", () => {
            const result = sanitizeHtml("Hello<br />World");

            expect(result).toContain("Hello\r\nWorld");
        });

        it("should convert </p> to double line breaks", () => {
            const result = sanitizeHtml("<p>Paragraph 1</p><p>Paragraph 2</p>");

            expect(result).toContain("Paragraph 1\r\n\n");
        });

        it("should remove <p> tags", () => {
            const result = sanitizeHtml("<p>Hello</p>");

            expect(result).not.toContain("<p>");
        });

        it("should strip remaining HTML tags", () => {
            const result = sanitizeHtml("<strong>bold</strong> and <a href='#'>link</a>");

            expect(result).not.toContain("<strong>");
            expect(result).not.toContain("<a");
            expect(result).toContain("bold");
            expect(result).toContain("link");
        });

        it("should add space before URLs", () => {
            const result = sanitizeHtml("Checkhttps://example.com");

            expect(result).toContain(" https://example.com");
        });

        it("should add space before http URLs", () => {
            const result = sanitizeHtml("Gohttp://example.com");

            expect(result).toContain(" http://example.com");
        });

        it("should handle plain text without HTML", () => {
            const result = sanitizeHtml("Just plain text");

            expect(result).toBe("Just plain text");
        });
    });

    // ── loadAttachments ──────────────────────────────────────────────

    describe("loadAttachments", () => {
        function makeStatus(mediaAttachments: MediaAttachment[]): Status {
            return {
                id: "1",
                created_at: "2026-04-01T12:00:00.000Z",
                sensitive: false,
                spoiler_text: "",
                visibility: "public",
                uri: "https://mastodon.example/statuses/1",
                url: "https://mastodon.example/@user/1",
                replies_count: 0,
                reblogs_count: 0,
                favourites_count: 0,
                content: "",
                account: {
                    id: "1",
                    username: "user",
                    acct: "user",
                    display_name: "User",
                    url: "https://mastodon.example/@user",
                    avatar: "",
                    header: "",
                    note: "",
                    followers_count: 0,
                    following_count: 0,
                    statuses_count: 0,
                    last_status_at: "",
                    emojis: []
                },
                media_attachments: mediaAttachments,
                mentions: [],
                tags: [],
                emojis: [],
                in_reply_to_id: null,
                in_reply_to_account_id: null,
                reblog: null
            };
        }

        function makeMediaAttachment(overrides: Partial<MediaAttachment> = {}): MediaAttachment {
            return {
                id: "att1",
                type: "image",
                url: "https://mastodon.example/media/img.jpg",
                preview_url: "https://mastodon.example/media/img_preview.jpg",
                description: "A nice photo",
                ...overrides
            };
        }

        beforeEach(() => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue({
                    ok: true,
                    headers: new Headers({ "Content-Type": "image/jpeg" })
                })
            );
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it("should load image attachments with mime type", async () => {
            const status = makeStatus([makeMediaAttachment()]);

            const result = await loadAttachments(status);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                url: "https://mastodon.example/media/img.jpg",
                type: "image",
                mimeType: "image/jpeg",
                altText: "A nice photo"
            });
        });

        it("should load video attachments", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue({
                    ok: true,
                    headers: new Headers({ "Content-Type": "video/mp4" })
                })
            );

            const status = makeStatus([makeMediaAttachment({ type: "video", url: "https://example.com/vid.mp4" })]);

            const result = await loadAttachments(status);

            expect(result).toHaveLength(1);
            expect(result[0].type).toBe("video");
            expect(result[0].mimeType).toBe("video/mp4");
        });

        it("should filter out unsupported attachment types (e.g. audio, gifv)", async () => {
            const status = makeStatus([
                makeMediaAttachment({ type: "audio", url: "https://example.com/audio.mp3" }),
                makeMediaAttachment({ type: "gifv", url: "https://example.com/anim.gif" })
            ]);

            const result = await loadAttachments(status);

            expect(result).toHaveLength(0);
        });

        it("should use null as altText when description is missing", async () => {
            const status = makeStatus([makeMediaAttachment({ description: null })]);

            const result = await loadAttachments(status);

            expect(result[0].altText).toBeNull();
        });

        it("should return null mimeType when HEAD request fails", async () => {
            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue({
                    ok: false,
                    status: 404,
                    headers: new Headers()
                })
            );

            const status = makeStatus([makeMediaAttachment()]);

            const result = await loadAttachments(status);

            expect(result[0].mimeType).toBeNull();
        });

        it("should return null mimeType when fetch throws", async () => {
            vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

            const status = makeStatus([makeMediaAttachment()]);

            const result = await loadAttachments(status);

            expect(result[0].mimeType).toBeNull();
        });

        it("should handle multiple attachments in parallel", async () => {
            const status = makeStatus([
                makeMediaAttachment({ id: "1", url: "https://example.com/a.jpg" }),
                makeMediaAttachment({ id: "2", url: "https://example.com/b.jpg" })
            ]);

            const result = await loadAttachments(status);

            expect(result).toHaveLength(2);
        });
    });

    // ── urlToUint8Array ──────────────────────────────────────────────

    describe("urlToUint8Array", () => {
        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it("should fetch URL and return Uint8Array", async () => {
            const fakeBuffer = new ArrayBuffer(4);
            new Uint8Array(fakeBuffer).set([10, 20, 30, 40]);

            vi.stubGlobal(
                "fetch",
                vi.fn().mockResolvedValue({
                    arrayBuffer: async () => fakeBuffer
                })
            );

            const result = await urlToUint8Array("https://example.com/img.jpg");

            expect(result).toBeInstanceOf(Uint8Array);
            expect(Array.from(result)).toEqual([10, 20, 30, 40]);
        });

        it("should propagate fetch errors", async () => {
            vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

            await expect(urlToUint8Array("https://example.com/fail")).rejects.toThrow("network error");
        });
    });
});
