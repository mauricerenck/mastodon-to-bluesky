import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Status } from "./mastodon/types.js";

// --- Mock functions ---
const mockLogin = vi.fn();
const mockPost = vi.fn();
const mockFetchNewToots = vi.fn();
const mockLoadLastProcessedPostId = vi.fn();
const mockSaveLastProcessedPostId = vi.fn();
const mockLoadAttachments = vi.fn();

vi.mock("dotenv/config", () => ({}));

vi.mock("./bluesky/index.js", () => ({
    login: (...args: unknown[]) => mockLogin(...args),
    post: (...args: unknown[]) => mockPost(...args)
}));

vi.mock("./mastodon/index.js", () => ({
    fetchNewToots: (...args: unknown[]) => mockFetchNewToots(...args)
}));

vi.mock("./utils.js", () => ({
    loadLastProcessedPostId: (...args: unknown[]) => mockLoadLastProcessedPostId(...args),
    saveLastProcessedPostId: (...args: unknown[]) => mockSaveLastProcessedPostId(...args),
    loadAttachments: (...args: unknown[]) => mockLoadAttachments(...args)
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeStatus(overrides: Partial<Status> = {}): Status {
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
        content: "Hello World",
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
            last_status_at: "2026-04-01",
            emojis: []
        },
        media_attachments: [],
        mentions: [],
        tags: [],
        emojis: [],
        ...overrides
    };
}

describe("main", () => {
    let setIntervalSpy: ReturnType<typeof vi.spyOn>;
    let intervalCallback: Function | null;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        intervalCallback = null;
        setIntervalSpy = vi.spyOn(global, "setInterval").mockImplementation(((fn: Function) => {
            intervalCallback = fn;
            return 0 as unknown as NodeJS.Timeout;
        }) as unknown as typeof setInterval);

        mockLogin.mockResolvedValue(undefined);
        mockFetchNewToots.mockResolvedValue([]);
        mockLoadLastProcessedPostId.mockResolvedValue(0);
        mockSaveLastProcessedPostId.mockResolvedValue(undefined);
        mockLoadAttachments.mockResolvedValue([]);
        mockPost.mockResolvedValue(undefined);

        vi.stubEnv("INTERVAL_MINUTES", "5");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        setIntervalSpy.mockRestore();
    });

    async function importMain() {
        await import("./main.js");
        await flushPromises();
    }

    // ── Startup ──────────────────────────────────────────────────────

    describe("startup", () => {
        it("should login to bluesky", async () => {
            await importMain();
            expect(mockLogin).toHaveBeenCalledTimes(1);
        });

        it("should fetch new toots after login", async () => {
            await importMain();
            expect(mockFetchNewToots).toHaveBeenCalledTimes(1);
        });

        it("should load last processed post ID", async () => {
            await importMain();
            expect(mockLoadLastProcessedPostId).toHaveBeenCalledTimes(1);
        });

        it("should set up interval with configured minutes", async () => {
            vi.stubEnv("INTERVAL_MINUTES", "10");
            await importMain();
            expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10 * 60 * 1000);
        });

        it("should default to 5 minutes interval when env var is not set", async () => {
            delete process.env.INTERVAL_MINUTES;
            await importMain();
            expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);
        });
    });

    // ── Post processing ──────────────────────────────────────────────

    describe("post processing", () => {
        it("should not post when there are no statuses", async () => {
            mockFetchNewToots.mockResolvedValue([]);
            mockLoadLastProcessedPostId.mockResolvedValue(1000);

            await importMain();

            expect(mockPost).not.toHaveBeenCalled();
        });

        it("should not post on first run (lastProcessedPostId is 0)", async () => {
            mockFetchNewToots.mockResolvedValue([makeStatus({ created_at: "2026-04-02T12:00:00.000Z" })]);
            mockLoadLastProcessedPostId.mockResolvedValue(0);

            await importMain();

            expect(mockPost).not.toHaveBeenCalled();
        });

        it("should save lastProcessedPostId on first run", async () => {
            mockFetchNewToots.mockResolvedValue([makeStatus({ created_at: "2026-04-02T12:00:00.000Z" })]);
            mockLoadLastProcessedPostId.mockResolvedValue(0);

            await importMain();

            expect(mockSaveLastProcessedPostId).toHaveBeenCalledWith(new Date("2026-04-02T12:00:00.000Z").getTime());
        });

        it("should post new statuses to bluesky", async () => {
            const status = makeStatus({
                created_at: "2026-04-02T12:00:00.000Z",
                content: "Hello Bluesky!"
            });
            mockLoadLastProcessedPostId.mockResolvedValue(new Date("2026-04-01T00:00:00.000Z").getTime());
            mockFetchNewToots.mockResolvedValue([status]);
            mockLoadAttachments.mockResolvedValue([]);

            await importMain();

            expect(mockPost).toHaveBeenCalledWith("Hello Bluesky!", []);
        });

        it("should not post statuses older than lastProcessedPostId", async () => {
            const oldStatus = makeStatus({
                created_at: "2026-03-01T12:00:00.000Z",
                content: "Old post"
            });
            mockLoadLastProcessedPostId.mockResolvedValue(new Date("2026-04-01T00:00:00.000Z").getTime());
            mockFetchNewToots.mockResolvedValue([oldStatus]);

            await importMain();

            expect(mockPost).not.toHaveBeenCalled();
        });

        it("should process statuses in chronological order (reversed)", async () => {
            const newer = makeStatus({
                id: "2",
                created_at: "2026-04-02T14:00:00.000Z",
                content: "Second"
            });
            const older = makeStatus({
                id: "1",
                created_at: "2026-04-02T12:00:00.000Z",
                content: "First"
            });
            mockLoadLastProcessedPostId.mockResolvedValue(new Date("2026-04-01T00:00:00.000Z").getTime());
            // API returns newest first
            mockFetchNewToots.mockResolvedValue([newer, older]);
            mockLoadAttachments.mockResolvedValue([]);

            await importMain();

            expect(mockPost).toHaveBeenCalledTimes(2);
            expect(mockPost).toHaveBeenNthCalledWith(1, "First", []);
            expect(mockPost).toHaveBeenNthCalledWith(2, "Second", []);
        });

        it("should pass attachments to bluesky post", async () => {
            const status = makeStatus({
                created_at: "2026-04-02T12:00:00.000Z",
                content: "Post with image"
            });
            mockLoadLastProcessedPostId.mockResolvedValue(new Date("2026-04-01T00:00:00.000Z").getTime());
            mockFetchNewToots.mockResolvedValue([status]);

            const attachments = [
                { url: "https://example.com/img.jpg", altText: "Photo", type: "image", mimeType: "image/jpeg" }
            ];
            mockLoadAttachments.mockResolvedValue(attachments);

            await importMain();

            expect(mockLoadAttachments).toHaveBeenCalledWith(status);
            expect(mockPost).toHaveBeenCalledWith("Post with image", attachments);
        });

        it("should save the newest timestamp as lastProcessedPostId", async () => {
            const newer = makeStatus({ created_at: "2026-04-02T14:00:00.000Z" });
            const older = makeStatus({ created_at: "2026-04-02T12:00:00.000Z" });
            mockLoadLastProcessedPostId.mockResolvedValue(new Date("2026-04-01T00:00:00.000Z").getTime());
            mockFetchNewToots.mockResolvedValue([newer, older]);
            mockLoadAttachments.mockResolvedValue([]);

            await importMain();

            expect(mockSaveLastProcessedPostId).toHaveBeenCalledWith(new Date("2026-04-02T14:00:00.000Z").getTime());
        });

        it("should not update newTimestampId when a later status has an equal or older timestamp", async () => {
            const status1 = makeStatus({
                id: "1",
                created_at: "2026-04-02T14:00:00.000Z",
                content: "First"
            });
            const status2 = makeStatus({
                id: "2",
                created_at: "2026-04-02T12:00:00.000Z",
                content: "Second"
            });
            mockLoadLastProcessedPostId.mockResolvedValue(new Date("2026-04-01T00:00:00.000Z").getTime());
            // After reverse: status2 (12:00) first, then status1 (14:00)
            // Then add a third with same timestamp as status1 to trigger the false branch
            const status3 = makeStatus({
                id: "3",
                created_at: "2026-04-02T14:00:00.000Z",
                content: "Third"
            });
            mockFetchNewToots.mockResolvedValue([status1, status3, status2]);
            mockLoadAttachments.mockResolvedValue([]);

            await importMain();

            // The newest timestamp should still be 14:00
            expect(mockSaveLastProcessedPostId).toHaveBeenCalledWith(new Date("2026-04-02T14:00:00.000Z").getTime());
        });

        it("should not save lastProcessedPostId when no statuses returned", async () => {
            mockFetchNewToots.mockResolvedValue([]);

            await importMain();

            expect(mockSaveLastProcessedPostId).not.toHaveBeenCalled();
        });
    });

    // ── Error handling ───────────────────────────────────────────────

    describe("error handling", () => {
        it("should not fetch toots when login fails", async () => {
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            mockLogin.mockRejectedValue(new Error("login failed"));

            await importMain();

            expect(mockFetchNewToots).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it("should not save lastProcessedPostId when fetchNewToots fails", async () => {
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            mockFetchNewToots.mockRejectedValue(new Error("fetch error"));

            await importMain();

            expect(mockSaveLastProcessedPostId).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it("should continue processing when loadAttachments fails for one status", async () => {
            const status1 = makeStatus({
                id: "1",
                created_at: "2026-04-02T12:00:00.000Z",
                content: "First"
            });
            const status2 = makeStatus({
                id: "2",
                created_at: "2026-04-02T14:00:00.000Z",
                content: "Second"
            });
            mockLoadLastProcessedPostId.mockResolvedValue(new Date("2026-04-01T00:00:00.000Z").getTime());
            // reversed in code: status1 processed first, then status2
            mockFetchNewToots.mockResolvedValue([status2, status1]);
            mockLoadAttachments.mockRejectedValueOnce(new Error("attachment error")).mockResolvedValueOnce([]);

            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

            await importMain();

            expect(mockPost).toHaveBeenCalledTimes(1);
            expect(mockPost).toHaveBeenCalledWith("Second", []);
            consoleSpy.mockRestore();
        });

        it("should still save lastProcessedPostId when loadAttachments fails", async () => {
            const status = makeStatus({
                created_at: "2026-04-02T12:00:00.000Z",
                content: "Failed post"
            });
            mockLoadLastProcessedPostId.mockResolvedValue(new Date("2026-04-01T00:00:00.000Z").getTime());
            mockFetchNewToots.mockResolvedValue([status]);
            mockLoadAttachments.mockRejectedValue(new Error("attachment error"));

            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

            await importMain();

            expect(mockSaveLastProcessedPostId).toHaveBeenCalledWith(new Date("2026-04-02T12:00:00.000Z").getTime());
            consoleSpy.mockRestore();
        });
    });

    // ── Interval ─────────────────────────────────────────────────────

    describe("interval", () => {
        it("should fetch toots again when interval fires", async () => {
            mockLoadLastProcessedPostId.mockResolvedValue(0);
            mockFetchNewToots.mockResolvedValue([]);

            await importMain();

            expect(mockFetchNewToots).toHaveBeenCalledTimes(1);

            expect(intervalCallback).not.toBeNull();
            await (intervalCallback as () => Promise<void>)();
            await flushPromises();

            expect(mockFetchNewToots).toHaveBeenCalledTimes(2);
        });

        it("should not set up interval when login fails", async () => {
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            mockLogin.mockRejectedValue(new Error("login failed"));

            await importMain();

            expect(intervalCallback).toBeNull();
            consoleSpy.mockRestore();
        });
    });
});
