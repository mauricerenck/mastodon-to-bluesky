import type { Account, MastodonSettings, Status } from "./types.js";
import { logger } from "../logger.js";

let settings: MastodonSettings | null = null;
let account: Account | null = null;

function loadSettings() {
    const url = process.env.MASTODON_INSTANCE;
    if (!url) throw new Error("MASTODON_INSTANCE environment variable is not set.");

    const username = process.env.MASTODON_USER;
    if (!username) throw new Error("MASTODON_USER environment variable is not set.");

    return {
        url,
        username
    } as MastodonSettings;
}

export const resetCache = () => {
    settings = null;
    account = null;
};

/**
 * periodically fetch new Mastodon posts
 * @param lastProcessedPostId
 * @returns
 */
export const fetchNewToots = async () => {
    if (!settings) {
        settings = loadSettings();
    }

    if (!account) {
        account = await getAccountByUsername(settings.url, settings.username);
    }
    const accountId = account.id;

    const ignoredTags = process.env.IGNORE_TAGS
        ? process.env.IGNORE_TAGS.toLowerCase()
              .split(",")
              .map((tag) => tag.trim())
        : null;

    try {
        const allStatuses = (await getStatuses(settings.url, accountId))
            .filter(
                // filter replies and re-blogs
                (status) =>
                    ((status.in_reply_to_id === null && status.in_reply_to_account_id === null) ||
                        (status.in_reply_to_id !== null && status.in_reply_to_account_id === accountId)) &&
                    status.reblog === null
            )
            .filter(
                // filter tags set to be ignored
                (status) => {
                    if (!ignoredTags || ignoredTags.length === 0) {
                        return true;
                    }

                    const statusTags = new Set(status.tags.map((tag) => tag.name.toLowerCase().trim()));
                    return !ignoredTags.some((tag) => statusTags.has(tag));
                }
            );

        //return lastProcessedPostId === 0 ? allStatuses : findAfterDate(allStatuses, new Date(lastProcessedPostId));
        return allStatuses;
    } catch (error) {
        logger.error("Fetching Mastodon statuses failed", { username: settings.username, error });
        throw error;
    }
};

async function getAccountByUsername(instanceUrl: string, username: string) {
    const accountApiURL = `${instanceUrl}/api/v1/accounts/lookup?acct=${username}`;
    const response = await fetch(accountApiURL);
    if (!response.ok) {
        throw new Error(`Failed to fetch account for ${username}: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as Account;
}

async function getStatuses(instanceUrl: string, accountId: string) {
    const allStatuses: Status[] = [];
    let nextUrl: string | null = `${instanceUrl}/api/v1/accounts/${accountId}/statuses`;
    let pageCount = 0;
    const maxPages = 20;

    while (nextUrl && pageCount < maxPages) {
        const response = await fetch(nextUrl);
        if (!response.ok) {
            throw new Error(
                `Failed to fetch statuses for account ${accountId}: ${response.status} ${response.statusText}`
            );
        }

        allStatuses.push(...((await response.json()) as Status[]));

        pageCount += 1;
        const linkHeader = typeof response.headers?.get === "function" ? response.headers.get("link") : null;
        nextUrl = getNextPageUrl(linkHeader);
    }

    if (pageCount >= maxPages && nextUrl) {
        logger.warn("Reached Mastodon pagination page limit", { accountId, maxPages });
    }

    return allStatuses;
}

function getNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) {
        return null;
    }

    const segments = linkHeader.split(",");
    for (const segment of segments) {
        const [urlPart, relPart] = segment.split(";").map((part) => part.trim());
        if (!urlPart || !relPart) {
            continue;
        }

        if (relPart !== 'rel="next"') {
            continue;
        }

        if (!urlPart.startsWith("<") || !urlPart.endsWith(">")) {
            continue;
        }

        return urlPart.slice(1, -1);
    }

    return null;
}
