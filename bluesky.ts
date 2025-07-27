import { RichText, AtpAgent } from "@atproto/api";

export async function loginToBluesky(): Promise<AtpAgent> {
    const blueskyUrl = Deno.env.get("BLUESKY_ENDPOINT");
    if (!blueskyUrl) throw new Error("BLUESKY_ENDPOINT not set");

    const agent = new AtpAgent({ service: blueskyUrl });
    const blueskyHandle = Deno.env.get("BLUESKY_HANDLE");
    if (!blueskyHandle) throw new Error("BLUESKY_HANDLE");

    const blueskyPassword = Deno.env.get("BLUESKY_PASSWORD");
    if (!blueskyPassword) throw new Error("BLUESKY_PASSWORD");

    try {
        const response = await agent.login({
            identifier: blueskyHandle,
            password: blueskyPassword
        });
        if (!response.success) throw new Error("login failed");
        return agent;
    } catch (error) {
        console.error("🔒 Login to Bluesky failed:", error);
        throw error;
    }
}

export const createBlueskyMessage = async (text: string, images) => {
    const richText = new RichText({ text });
    await richText.detectFacets(agent);

    return {
        text: richText.text,
        facets: richText.facets
    };
};
