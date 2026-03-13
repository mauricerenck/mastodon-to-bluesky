import type { Account, MastodonSettings, Status } from "./types.js";

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

    try {
        const allStatuses = (await getStatuses(settings.url, account.id)).filter(
            // filter replies and re-blogs
            (status) =>
                status.in_reply_to_id === null && status.in_reply_to_account_id === null && status.reblog === null
        );

        //return lastProcessedPostId === 0 ? allStatuses : findAfterDate(allStatuses, new Date(lastProcessedPostId));
        return allStatuses;
    } catch (error) {
        console.error(`getting toots for ${settings.username} returned an error`, error);
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
    const statusApiUrl = `${instanceUrl}/api/v1/accounts/${accountId}/statuses`;
    const response = await fetch(statusApiUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch statuses for account ${accountId}: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as Status[];
}
