import type { Account, Status } from "./mastodonTypes.ts";

const url = Deno.env.get("MASTODON_INSTANCE");
if (!url) throw new Error("MASTODON_INSTANCE environment variable is not set.");

const username = Deno.env.get("MASTODON_USER");
if (!username) throw new Error("MASTODON_USER environment variable is not set.");

const account = await getAccountByUsername(url, username);

/**
 * periodically fetch new Mastodon posts
 * @param lastProcessedPostId
 * @returns
 */
export const fetchNewToots = async () => {
    try {
        const statuses = await getStatuses(url, account.id);
        console.log("🦢", `load ${statuses.length} toots`);
        return statuses;
    } catch (e) {
        console.log(`getting toots for ${username} returned an error`);
        throw e;
    }
};

async function getAccountByUsername(instanceUrl: string, username: string) {
    const accountApiURL = `${instanceUrl}/api/v1/accounts/lookup?acct=${username}`;
    const response = await fetch(accountApiURL);
    return (await response.json()) as Account;
}

async function getStatuses(instanceUrl: string, accountId: string) {
    const statusApiUrl = `${instanceUrl}/api/v1/accounts/${accountId}/statuses`;
    const response = await fetch(statusApiUrl);
    return (await response.json()) as Status[];
}
