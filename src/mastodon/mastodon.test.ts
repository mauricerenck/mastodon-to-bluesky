import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchNewToots, resetCache } from "./mastodon.js";
import type { Account, Status } from "./types.js";

function makeAccount(overrides: Partial<Account> = {}): Account {
    return {
        id: "12345",
        username: "testuser",
        acct: "testuser",
        display_name: "Test User",
        url: "https://mastodon.example/@testuser",
        avatar: "https://mastodon.example/avatar.png",
        header: "https://mastodon.example/header.png",
        note: "A test account",
        followers_count: 10,
        following_count: 5,
        statuses_count: 100,
        last_status_at: "2026-04-01",
        emojis: [],
        ...overrides
    };
}

function makeStatus(overrides: Partial<Status> = {}): Status {
    return {
        id: "1",
        created_at: "2026-04-01T12:00:00.000Z",
        in_reply_to_id: null,
        in_reply_to_account_id: null,
        sensitive: false,
        spoiler_text: "",
        visibility: "public",
        language: "en",
        uri: "https://mastodon.example/statuses/1",
        url: "https://mastodon.example/@testuser/1",
        replies_count: 0,
        reblogs_count: 0,
        favourites_count: 0,
        content: "<p>Hello world</p>",
        reblog: null,
        account: makeAccount(),
        media_attachments: [],
        mentions: [],
        tags: [],
        emojis: [],
        ...overrides
    };
}

function mockFetch(
    responses: Map<string, { ok: boolean; json: () => Promise<unknown>; status?: number; statusText?: string }>
) {
    return vi.fn((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const match = responses.get(url);
        if (match) {
            return Promise.resolve({
                ok: match.ok,
                status: match.status ?? (match.ok ? 200 : 500),
                statusText: match.statusText ?? (match.ok ? "OK" : "Internal Server Error"),
                json: match.json
            } as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });
}

describe("mastodon", () => {
    const INSTANCE_URL = "https://mastodon.example";
    const USERNAME = "testuser";
    const ACCOUNT_ID = "12345";

    beforeEach(() => {
        resetCache();
        vi.stubEnv("MASTODON_INSTANCE", INSTANCE_URL);
        vi.stubEnv("MASTODON_USER", USERNAME);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    describe("loadSettings / environment variables", () => {
        it("should throw when MASTODON_INSTANCE is not set", async () => {
            vi.stubEnv("MASTODON_INSTANCE", "");
            // loadSettings checks for truthiness, empty string is falsy
            await expect(fetchNewToots()).rejects.toThrow("MASTODON_INSTANCE environment variable is not set.");
        });

        it("should throw when MASTODON_USER is not set", async () => {
            vi.stubEnv("MASTODON_USER", "");
            await expect(fetchNewToots()).rejects.toThrow("MASTODON_USER environment variable is not set.");
        });
    });

    describe("API error handling", () => {
        it("should throw when account lookup fails", async () => {
            const responses = new Map([
                [
                    `${INSTANCE_URL}/api/v1/accounts/lookup?acct=${USERNAME}`,
                    { ok: false, json: async () => ({}), status: 404, statusText: "Not Found" }
                ]
            ]);
            vi.stubGlobal("fetch", mockFetch(responses));

            await expect(fetchNewToots()).rejects.toThrow(`Failed to fetch account for ${USERNAME}: 404 Not Found`);
        });

        it("should throw when statuses fetch fails", async () => {
            const responses = new Map([
                [
                    `${INSTANCE_URL}/api/v1/accounts/lookup?acct=${USERNAME}`,
                    { ok: true, json: async () => makeAccount() }
                ],
                [
                    `${INSTANCE_URL}/api/v1/accounts/${ACCOUNT_ID}/statuses`,
                    { ok: false, json: async () => ({}), status: 500, statusText: "Internal Server Error" }
                ]
            ]);
            vi.stubGlobal("fetch", mockFetch(responses));

            await expect(fetchNewToots()).rejects.toThrow(
                `Failed to fetch statuses for account ${ACCOUNT_ID}: 500 Internal Server Error`
            );
        });
    });

    describe("fetchNewToots", () => {
        it("should return all original statuses", async () => {
            const statuses: Status[] = [
                makeStatus({ id: "1", content: "<p>Post 1</p>" }),
                makeStatus({ id: "2", content: "<p>Post 2</p>" })
            ];

            const responses = new Map([
                [
                    `${INSTANCE_URL}/api/v1/accounts/lookup?acct=${USERNAME}`,
                    { ok: true, json: async () => makeAccount() }
                ],
                [`${INSTANCE_URL}/api/v1/accounts/${ACCOUNT_ID}/statuses`, { ok: true, json: async () => statuses }]
            ]);
            vi.stubGlobal("fetch", mockFetch(responses));

            const result = await fetchNewToots();
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe("1");
            expect(result[1].id).toBe("2");
        });

        it("should filter out replies", async () => {
            const statuses: Status[] = [
                makeStatus({ id: "1", content: "<p>Normal post</p>" }),
                makeStatus({ id: "2", content: "<p>Reply</p>", in_reply_to_id: "99", in_reply_to_account_id: "88" })
            ];

            const responses = new Map([
                [
                    `${INSTANCE_URL}/api/v1/accounts/lookup?acct=${USERNAME}`,
                    { ok: true, json: async () => makeAccount() }
                ],
                [`${INSTANCE_URL}/api/v1/accounts/${ACCOUNT_ID}/statuses`, { ok: true, json: async () => statuses }]
            ]);
            vi.stubGlobal("fetch", mockFetch(responses));

            const result = await fetchNewToots();
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("1");
        });

        it("should filter out reblogs", async () => {
            const statuses: Status[] = [
                makeStatus({ id: "1", content: "<p>Normal post</p>" }),
                makeStatus({ id: "2", content: "<p>Reblog</p>", reblog: makeStatus({ id: "original" }) })
            ];

            const responses = new Map([
                [
                    `${INSTANCE_URL}/api/v1/accounts/lookup?acct=${USERNAME}`,
                    { ok: true, json: async () => makeAccount() }
                ],
                [`${INSTANCE_URL}/api/v1/accounts/${ACCOUNT_ID}/statuses`, { ok: true, json: async () => statuses }]
            ]);
            vi.stubGlobal("fetch", mockFetch(responses));

            const result = await fetchNewToots();
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("1");
        });

        it("should filter out posts that are only reply to another account (in_reply_to_account_id set)", async () => {
            const statuses: Status[] = [
                makeStatus({ id: "1", content: "<p>Normal post</p>" }),
                makeStatus({ id: "2", content: "<p>Partial reply</p>", in_reply_to_account_id: "88" })
            ];

            const responses = new Map([
                [
                    `${INSTANCE_URL}/api/v1/accounts/lookup?acct=${USERNAME}`,
                    { ok: true, json: async () => makeAccount() }
                ],
                [`${INSTANCE_URL}/api/v1/accounts/${ACCOUNT_ID}/statuses`, { ok: true, json: async () => statuses }]
            ]);
            vi.stubGlobal("fetch", mockFetch(responses));

            const result = await fetchNewToots();
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("1");
        });

        it("should return empty array when all statuses are filtered", async () => {
            const statuses: Status[] = [
                makeStatus({ id: "1", in_reply_to_id: "99", in_reply_to_account_id: "88" }),
                makeStatus({ id: "2", reblog: makeStatus({ id: "original" }) })
            ];

            const responses = new Map([
                [
                    `${INSTANCE_URL}/api/v1/accounts/lookup?acct=${USERNAME}`,
                    { ok: true, json: async () => makeAccount() }
                ],
                [`${INSTANCE_URL}/api/v1/accounts/${ACCOUNT_ID}/statuses`, { ok: true, json: async () => statuses }]
            ]);
            vi.stubGlobal("fetch", mockFetch(responses));

            const result = await fetchNewToots();
            expect(result).toHaveLength(0);
        });
    });

    describe("caching / resetCache", () => {
        it("should cache account and not re-fetch on second call", async () => {
            const statuses: Status[] = [makeStatus({ id: "1" })];

            const responses = new Map([
                [
                    `${INSTANCE_URL}/api/v1/accounts/lookup?acct=${USERNAME}`,
                    { ok: true, json: async () => makeAccount() }
                ],
                [`${INSTANCE_URL}/api/v1/accounts/${ACCOUNT_ID}/statuses`, { ok: true, json: async () => statuses }]
            ]);
            const fetchMock = mockFetch(responses);
            vi.stubGlobal("fetch", fetchMock);

            await fetchNewToots();
            await fetchNewToots();

            // account lookup should be called once, statuses twice
            const accountCalls = fetchMock.mock.calls.filter(
                ([url]: [string]) => typeof url === "string" && url.includes("/accounts/lookup")
            );
            const statusCalls = fetchMock.mock.calls.filter(
                ([url]: [string]) => typeof url === "string" && url.includes("/statuses")
            );
            expect(accountCalls).toHaveLength(1);
            expect(statusCalls).toHaveLength(2);
        });

        it("should re-fetch account after resetCache", async () => {
            const statuses: Status[] = [makeStatus({ id: "1" })];

            const responses = new Map([
                [
                    `${INSTANCE_URL}/api/v1/accounts/lookup?acct=${USERNAME}`,
                    { ok: true, json: async () => makeAccount() }
                ],
                [`${INSTANCE_URL}/api/v1/accounts/${ACCOUNT_ID}/statuses`, { ok: true, json: async () => statuses }]
            ]);
            const fetchMock = mockFetch(responses);
            vi.stubGlobal("fetch", fetchMock);

            await fetchNewToots();
            resetCache();
            await fetchNewToots();

            const accountCalls = fetchMock.mock.calls.filter(
                ([url]: [string]) => typeof url === "string" && url.includes("/accounts/lookup")
            );
            expect(accountCalls).toHaveLength(2);
        });
    });
});
