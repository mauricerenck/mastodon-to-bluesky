import { RichText, AtpAgent } from "@atproto/api";

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
  // Bluesky agent
  const blueskyUrl = Deno.env.get("BLUESKY_ENDPOINT");
  if (!blueskyUrl) throw new Error("BLUESKY_ENDPOINT not set");

  const agent = new AtpAgent({ service: blueskyUrl });
  const blueskyHandle = Deno.env.get("BLUESKY_HANDLE");
  if (!blueskyHandle) throw new Error("BLUESKY_HANDLE");

  const blueskyPassword = Deno.env.get("BLUESKY_PASSWORD");
  if (!blueskyPassword) throw new Error("BLUESKY_PASSWORD");

  try {
    const loginResponse = await agent.login({
      identifier: blueskyHandle,
      password: blueskyPassword,
    });
    if (!loginResponse.success) throw new Error("login failed");
  } catch (error) {
    console.error("🔒 login failed", error);
  }
}
