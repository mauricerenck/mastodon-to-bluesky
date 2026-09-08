import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Status, MediaAttachment } from "./mastodon/types.js";

// --- Mock fs/promises ---
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();

vi.mock("fs/promises", () => ({
    default: {
        readFile: (...args: unknown[]) => mockReadFile(...args),
        writeFile: (...args: unknown[]) => mockWriteFile(...args),
        mkdir: (...args: unknown[]) => mockMkdir(...args)
    }
}));

import {
    compareProcessedPostMarkers,
    getProcessedPostMarker,
    loadLastProcessedMarker,
    saveLastProcessedMarker,
    loadThreadState,
    saveThreadState,
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

    // ── loadLastProcessedMarker ──────────────────────────────────────

    describe("loadLastProcessedMarker", () => {
        it("should return the marker from file", async () => {
            mockReadFile.mockResolvedValue(JSON.stringify({ createdAt: 123456, id: "post-1" }));

            const result = await loadLastProcessedMarker();

            expect(result).toEqual({ createdAt: 123456, id: "post-1" });
            expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining("lastProcessedPostId.txt"), "utf-8");
        });

        it("should migrate a legacy timestamp without reposting equal-timestamp statuses", async () => {
            mockReadFile.mockResolvedValue("123456\n");
            mockMkdir.mockResolvedValue(undefined);
            mockWriteFile.mockResolvedValue(undefined);

            const result = await loadLastProcessedMarker();

            expect(result).toEqual({ createdAt: 123456, id: null });
            expect(mockWriteFile).toHaveBeenCalledWith(
                expect.stringContaining("lastProcessedPostId.txt"),
                JSON.stringify({ createdAt: 123456, id: null }),
                "utf-8"
            );
        });

        it("should trim whitespace before parsing", async () => {
            mockReadFile.mockResolvedValue(`  ${JSON.stringify({ createdAt: 789, id: "post-1" })}  \n`);

            const result = await loadLastProcessedMarker();

            expect(result).toEqual({ createdAt: 789, id: "post-1" });
        });

        it("should initialize state with 0 when file does not exist", async () => {
            mockReadFile.mockRejectedValue({ code: "ENOENT" });
            mockMkdir.mockResolvedValue(undefined);
            mockWriteFile.mockResolvedValue(undefined);

            const result = await loadLastProcessedMarker();

            expect(result).toEqual({ createdAt: 0, id: null });
            expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining("data"), { recursive: true });
            expect(mockWriteFile).toHaveBeenCalledWith(
                expect.stringContaining("lastProcessedPostId.txt"),
                JSON.stringify({ createdAt: 0, id: null }),
                "utf-8"
            );
        });

        it("should throw when state file contains an invalid marker", async () => {
            mockReadFile.mockResolvedValue("not-a-number");

            await expect(loadLastProcessedMarker()).rejects.toThrow("Invalid value");
        });
    });

    // ── saveLastProcessedMarker ──────────────────────────────────────

    describe("saveLastProcessedMarker", () => {
        it("should write the marker to file", async () => {
            mockMkdir.mockResolvedValue(undefined);
            mockWriteFile.mockResolvedValue(undefined);

            const marker = { createdAt: 42, id: "post-42" };
            await saveLastProcessedMarker(marker);

            expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining("data"), { recursive: true });
            expect(mockWriteFile).toHaveBeenCalledWith(
                expect.stringContaining("lastProcessedPostId.txt"),
                JSON.stringify(marker),
                "utf-8"
            );
        });

        it("should throw when write fails", async () => {
            mockMkdir.mockResolvedValue(undefined);
            mockWriteFile.mockRejectedValue(new Error("EACCES"));

            await expect(saveLastProcessedMarker({ createdAt: 42, id: "post-42" })).rejects.toThrow("EACCES");
        });
    });

    describe("processed post markers", () => {
        it("should create a marker from a status", () => {
            expect(getProcessedPostMarker({ id: "post-1", created_at: "2026-04-01T12:00:00.000Z" })).toEqual({
                createdAt: 1775044800000,
                id: "post-1"
            });
        });

        it("should order statuses with identical timestamps by ID", () => {
            const earlier = { createdAt: 1000, id: "999999999999999999" };
            const later = { createdAt: 1000, id: "1000000000000000000" };

            expect(compareProcessedPostMarkers(later, earlier)).toBeGreaterThan(0);
        });

        it("should keep legacy markers ahead of statuses at the same timestamp", () => {
            const legacyMarker = { createdAt: 1000, id: null };
            const statusMarker = { createdAt: 1000, id: "1" };

            expect(compareProcessedPostMarkers(statusMarker, legacyMarker)).toBeLessThan(0);
        });
    });

    describe("thread state", () => {
        const threadState = {
            "mastodon-1": {
                root: { uri: "at://root", cid: "cid-root" },
                parent: { uri: "at://parent", cid: "cid-parent" }
            }
        };

        it("should load persisted thread state", async () => {
            mockReadFile.mockResolvedValue(JSON.stringify(threadState));

            await expect(loadThreadState()).resolves.toEqual(threadState);
        });

        it("should initialize thread state when the file does not exist", async () => {
            mockReadFile.mockRejectedValue({ code: "ENOENT" });
            mockMkdir.mockResolvedValue(undefined);
            mockWriteFile.mockResolvedValue(undefined);

            await expect(loadThreadState()).resolves.toEqual({});
            expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining("threadState.json"), "{}", "utf-8");
        });

        it("should reject invalid persisted thread state", async () => {
            mockReadFile.mockResolvedValue(JSON.stringify({ "mastodon-1": { root: {}, parent: {} } }));

            await expect(loadThreadState()).rejects.toThrow("Invalid value");
        });

        it("should save thread state", async () => {
            mockMkdir.mockResolvedValue(undefined);
            mockWriteFile.mockResolvedValue(undefined);

            await saveThreadState(threadState);

            expect(mockWriteFile).toHaveBeenCalledWith(
                expect.stringContaining("threadState.json"),
                JSON.stringify(threadState, null, 2),
                "utf-8"
            );
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
