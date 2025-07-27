import type { Account, Status } from "./mastodonTypes.ts";

/**
 * periodically fetch new Mastodon posts
 * @param lastProcessedPostId
 * @returns
 */
export const fetchNewToots = async () => {
    const instanceUrl = Deno.env.get("MASTODON_INSTANCE");
    if (!instanceUrl) throw new Error("MASTODON_INSTANCE environment variable is not set.");

    const mastodonUser = Deno.env.get("MASTODON_USER");
    if (!mastodonUser) throw new Error("MASTODON_USER environment variable is not set.");

    try {
        const account = await getAccountByUsername(instanceUrl, mastodonUser);
        const statuses = await getStatuses(instanceUrl, account.id);
        return statuses;
    } catch (e) {
        console.log(`getting toots for ${mastodonUser} returned an error`);
        throw e;
    }
};

const getAccountByUsername = async (instanceUrl: string, username: string) => {
    const accountApiURL = `${instanceUrl}/api/v1/accounts/lookup?acct=${username}`;
    const response = await fetch(accountApiURL);
    return (await response.json()) as Account;
};

const getStatuses = async (instanceUrl: string, accountId: string) => {
    const statusApiUrl = `${instanceUrl}/api/v1/accounts/${accountId}/statuses`;
    const response = await fetch(statusApiUrl);
    return (await response.json()) as Status[];
};
