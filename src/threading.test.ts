import { describe, expect, it } from "vitest";
import { buildConsecutiveThreadPlan } from "./threading.js";
import type { Status } from "./mastodon/types.js";

function makeStatus(overrides: Partial<Status> = {}): Status {
    return {
        id: "1",
        created_at: "2026-04-01T12:00:00.000Z",
        in_reply_to_id: null,
        in_reply_to_account_id: null,
        sensitive: false,
        spoiler_text: "",
        visibility: "public",
        uri: "https://mastodon.example/statuses/1",
        url: "https://mastodon.example/@user/1",
        replies_count: 0,
        reblogs_count: 0,
        favourites_count: 0,
        content: "Hello World",
        reblog: null,
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

describe("threading", () => {
    it("keeps roots in chronological order", () => {
        const latest = makeStatus({ id: "3", created_at: "2026-04-01T14:00:00.000Z" });
        const middle = makeStatus({ id: "2", created_at: "2026-04-01T13:00:00.000Z" });
        const earliest = makeStatus({ id: "1", created_at: "2026-04-01T12:00:00.000Z" });

        const result = buildConsecutiveThreadPlan([latest, middle, earliest]);

        expect(result.map((item) => item.status.id)).toEqual(["1", "2", "3"]);
        expect(result.every((item) => item.continuesThread === false)).toBe(true);
    });

    it("keeps direct consecutive replies and marks thread continuation", () => {
        const root = makeStatus({ id: "1", created_at: "2026-04-01T12:00:00.000Z" });
        const reply1 = makeStatus({
            id: "2",
            created_at: "2026-04-01T12:01:00.000Z",
            in_reply_to_id: "1"
        });
        const reply2 = makeStatus({
            id: "3",
            created_at: "2026-04-01T12:02:00.000Z",
            in_reply_to_id: "2"
        });

        const result = buildConsecutiveThreadPlan([reply2, reply1, root]);

        expect(result.map((item) => [item.status.id, item.continuesThread])).toEqual([
            ["1", false],
            ["2", true],
            ["3", true]
        ]);
    });

    it("drops non-consecutive replies", () => {
        const root = makeStatus({ id: "1", created_at: "2026-04-01T12:00:00.000Z" });
        const unrelated = makeStatus({ id: "2", created_at: "2026-04-01T12:01:00.000Z" });
        const lateReplyToRoot = makeStatus({
            id: "3",
            created_at: "2026-04-01T12:02:00.000Z",
            in_reply_to_id: "1"
        });

        const result = buildConsecutiveThreadPlan([lateReplyToRoot, unrelated, root]);

        expect(result.map((item) => item.status.id)).toEqual(["1", "2"]);
    });
});
