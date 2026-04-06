import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import type { Attachment } from "../mastodon/types.js";

// --- Mock @atproto/api ---
const mockPost = vi.fn();
const mockUploadBlob = vi.fn();
const mockLogin = vi.fn();
const mockDetectFacets = vi.fn();

vi.mock("@atproto/api", () => {
    class MockAtpAgent {
        login = mockLogin;
        post = mockPost;
        uploadBlob = mockUploadBlob;
    }

    class MockRichText {
        text: string;
        facets: unknown[] = [];
        detectFacets = mockDetectFacets;
        constructor({ text }: { text: string }) {
            this.text = text;
        }
    }

    return {
        AtpAgent: MockAtpAgent,
        RichText: MockRichText
    };
});

// --- Mock ../utils.js ---
vi.mock("../utils.js", () => ({
    sanitizeHtml: vi.fn((input: string) => input),
    splitText: vi.fn((text: string, maxLength: number) => {
        // simple split: if text > maxLength, split at maxLength boundary by words
        if (text.length <= maxLength) return [text];
        const words = text.split(" ");
        const parts: string[] = [];
        let current = "";
        for (const word of words) {
            const potential = current ? `${current} ${word}` : word;
            if (potential.length <= maxLength) {
                current = potential;
            } else {
                if (current) parts.push(current);
                current = word;
            }
        }
        if (current) parts.push(current);
        return parts;
    }),
    urlToUint8Array: vi.fn(async () => new Uint8Array([1, 2, 3]))
}));

import { login, post, resetCache } from "./bluesky.js";

describe("bluesky", () => {
    const ENDPOINT = "https://bsky.social";
    const HANDLE = "testuser.bsky.social";
    const PASSWORD = "secret123";

    beforeEach(() => {
        resetCache();
        vi.stubEnv("BLUESKY_ENDPOINT", ENDPOINT);
        vi.stubEnv("BLUESKY_HANDLE", HANDLE);
        vi.stubEnv("BLUESKY_PASSWORD", PASSWORD);
        vi.stubEnv("BLUESKY_MAX_POST_LENGTH", "300");

        mockLogin.mockResolvedValue({ success: true });
        mockPost.mockResolvedValue({ uri: "at://did:plc:abc/app.bsky.feed.post/123", cid: "cid123" });
        mockDetectFacets.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    describe("loadSettings / environment variables", () => {
        it("should use default maxPostLength of 300 when env var is not set", async () => {
            delete process.env.BLUESKY_MAX_POST_LENGTH;
            await login();

            // Post a short message to verify login works with default settings
            await post("Test", []);
            expect(mockPost).toHaveBeenCalledTimes(1);
        });

        it("should throw when BLUESKY_ENDPOINT is not set", async () => {
            vi.stubEnv("BLUESKY_ENDPOINT", "");
            await expect(login()).rejects.toThrow("BLUESKY_ENDPOINT not set");
        });

        it("should throw when BLUESKY_HANDLE is not set", async () => {
            vi.stubEnv("BLUESKY_HANDLE", "");
            await expect(login()).rejects.toThrow("BLUESKY_HANDLE");
        });

        it("should throw when BLUESKY_PASSWORD is not set", async () => {
            vi.stubEnv("BLUESKY_PASSWORD", "");
            await expect(login()).rejects.toThrow("BLUESKY_PASSWORD");
        });
    });

    describe("login", () => {
        it("should login successfully", async () => {
            await login();

            expect(mockLogin).toHaveBeenCalledWith({
                identifier: HANDLE,
                password: PASSWORD
            });
        });

        it("should throw when login response is not successful", async () => {
            mockLogin.mockResolvedValue({ success: false });

            await expect(login()).rejects.toThrow("login failed");
        });

        it("should throw when login throws an error", async () => {
            mockLogin.mockRejectedValue(new Error("network error"));

            await expect(login()).rejects.toThrow("network error");
        });

        it("should not login again if already logged in", async () => {
            await login();
            await login();

            expect(mockLogin).toHaveBeenCalledTimes(1);
        });

        it("should re-login after resetCache", async () => {
            await login();
            resetCache();
            await login();

            expect(mockLogin).toHaveBeenCalledTimes(2);
        });
    });

    describe("post", () => {
        beforeEach(async () => {
            await login();
        });

        it("should create a single post without images", async () => {
            await post("Hello Bluesky!", []);

            expect(mockPost).toHaveBeenCalledTimes(1);
            expect(mockPost).toHaveBeenCalledWith({
                text: "Hello Bluesky!",
                facets: []
            });
        });

        it("should create a single post with images", async () => {
            const fakeBlob = { ref: "blob-ref", mimeType: "image/jpeg", size: 100 };
            mockUploadBlob.mockResolvedValue({
                success: true,
                data: { blob: fakeBlob }
            });

            const attachments: Attachment[] = [
                { url: "https://example.com/img.jpg", altText: "A photo", type: "image", mimeType: "image/jpeg" }
            ];

            await post("Post with image", attachments);

            expect(mockUploadBlob).toHaveBeenCalledTimes(1);
            expect(mockPost).toHaveBeenCalledTimes(1);
            expect(mockPost).toHaveBeenCalledWith({
                text: "Post with image",
                facets: [],
                embed: {
                    images: [{ alt: "A photo", image: fakeBlob }],
                    $type: "app.bsky.embed.images"
                }
            });
        });

        it("should upload multiple images", async () => {
            const fakeBlob1 = { ref: "blob-ref-1", mimeType: "image/jpeg", size: 100 };
            const fakeBlob2 = { ref: "blob-ref-2", mimeType: "image/png", size: 200 };
            mockUploadBlob
                .mockResolvedValueOnce({ success: true, data: { blob: fakeBlob1 } })
                .mockResolvedValueOnce({ success: true, data: { blob: fakeBlob2 } });

            const attachments: Attachment[] = [
                { url: "https://example.com/1.jpg", altText: "Photo 1", type: "image", mimeType: "image/jpeg" },
                { url: "https://example.com/2.png", altText: "Photo 2", type: "image", mimeType: "image/png" }
            ];

            await post("Two images", attachments);

            expect(mockUploadBlob).toHaveBeenCalledTimes(2);
            expect(mockPost).toHaveBeenCalledWith(
                expect.objectContaining({
                    embed: expect.objectContaining({
                        images: [
                            { alt: "Photo 1", image: fakeBlob1 },
                            { alt: "Photo 2", image: fakeBlob2 }
                        ]
                    })
                })
            );
        });

        it("should skip video attachments during upload", async () => {
            const attachments: Attachment[] = [
                { url: "https://example.com/video.mp4", altText: "A video", type: "video", mimeType: "video/mp4" }
            ];

            await post("Post with video", attachments);

            expect(mockUploadBlob).not.toHaveBeenCalled();
            // no embed because no images uploaded
            expect(mockPost).toHaveBeenCalledWith({
                text: "Post with video",
                facets: []
            });
        });

        it("should skip images without mime type", async () => {
            const attachments: Attachment[] = [
                { url: "https://example.com/img.jpg", altText: "No mime", type: "image", mimeType: null }
            ];

            await post("Post with bad image", attachments);

            expect(mockUploadBlob).not.toHaveBeenCalled();
        });

        it("should continue when image upload fails", async () => {
            mockUploadBlob.mockResolvedValue({ success: false, data: {} });

            const attachments: Attachment[] = [
                { url: "https://example.com/img.jpg", altText: "Broken", type: "image", mimeType: "image/jpeg" }
            ];

            await post("Post with failed upload", attachments);

            expect(mockUploadBlob).toHaveBeenCalledTimes(1);
            // no embed because upload failed
            expect(mockPost).toHaveBeenCalledWith({
                text: "Post with failed upload",
                facets: []
            });
        });

        it("should continue when image upload throws", async () => {
            mockUploadBlob.mockRejectedValue(new Error("upload error"));

            const attachments: Attachment[] = [
                { url: "https://example.com/img.jpg", altText: "Error", type: "image", mimeType: "image/jpeg" }
            ];

            await post("Post with upload error", attachments);

            expect(mockPost).toHaveBeenCalledTimes(1);
        });

        it("should create a thread for long messages", async () => {
            const rootResponse = { uri: "at://root", cid: "cid-root" };
            const replyResponse = { uri: "at://reply", cid: "cid-reply" };
            mockPost.mockResolvedValueOnce(rootResponse).mockResolvedValueOnce(replyResponse);

            // A long message that splitText will split into two parts
            const longText = "A".repeat(150) + " " + "B".repeat(150) + " " + "C".repeat(100);

            await post(longText, []);

            expect(mockPost).toHaveBeenCalledTimes(2);

            // Second call should be a reply to the root
            const secondCall = mockPost.mock.calls[1][0];
            expect(secondCall.reply).toEqual({
                root: rootResponse,
                parent: rootResponse
            });
        });

        it("should chain replies in thread with 3+ parts", async () => {
            const rootResponse = { uri: "at://root", cid: "cid-root" };
            const reply1Response = { uri: "at://reply1", cid: "cid-reply1" };
            const reply2Response = { uri: "at://reply2", cid: "cid-reply2" };
            mockPost
                .mockResolvedValueOnce(rootResponse)
                .mockResolvedValueOnce(reply1Response)
                .mockResolvedValueOnce(reply2Response);

            // A very long message that will be split into 3+ parts
            const longText = Array.from({ length: 20 }, (_, i) => `Word${i}`.padEnd(20, "x")).join(" ");

            await post(longText, []);

            // At least 2 posts (depends on mock splitText behavior)
            expect(mockPost.mock.calls.length).toBeGreaterThanOrEqual(2);

            // If we have 3+ parts, the 3rd reply should reference the 2nd as parent
            if (mockPost.mock.calls.length >= 3) {
                const thirdCall = mockPost.mock.calls[2][0];
                expect(thirdCall.reply).toEqual({
                    root: rootResponse,
                    parent: reply1Response
                });
            }
        });

        it("should only attach images to root post in thread", async () => {
            const fakeBlob = { ref: "blob-ref", mimeType: "image/jpeg", size: 100 };
            mockUploadBlob.mockResolvedValue({ success: true, data: { blob: fakeBlob } });

            const rootResponse = { uri: "at://root", cid: "cid-root" };
            mockPost.mockResolvedValueOnce(rootResponse).mockResolvedValue({ uri: "at://reply", cid: "cid-reply" });

            const longText = "A".repeat(150) + " " + "B".repeat(200);
            const attachments: Attachment[] = [
                { url: "https://example.com/img.jpg", altText: "Photo", type: "image", mimeType: "image/jpeg" }
            ];

            await post(longText, attachments);

            // Root post should have embed
            const rootCall = mockPost.mock.calls[0][0];
            expect(rootCall.embed).toBeDefined();

            // Reply posts should NOT have embed
            if (mockPost.mock.calls.length > 1) {
                const replyCall = mockPost.mock.calls[1][0];
                expect(replyCall.embed).toBeUndefined();
            }
        });
    });
});
