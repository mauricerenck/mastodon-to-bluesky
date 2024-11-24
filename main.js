require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { RichText, BskyAgent } = require("@atproto/api");
const axios = require("axios");

// Mastodon credentials
const mastodonInstance = process.env.MASTODON_INSTANCE;
const mastodonUser = process.env.MASTODON_USER;

async function main() {
  // Bluesky agent
  const agent = new BskyAgent({ service: process.env.BLUESKY_ENDPOINT });
  const loginResponse = await agent.login({
    identifier: process.env.BLUESKY_HANDLE,
    password: process.env.BLUESKY_PASSWORD,
  });
  if (!loginResponse.success) console.error("🔒 login failed");

  // File to store the last processed Mastodon post ID
  const lastProcessedPostIdFile = path.join(
    __dirname,
    "data",
    "lastProcessedPostId.txt"
  );

  // Variable to store the last processed Mastodon post ID
  let lastProcessedPostId = loadLastProcessedPostId();

  // Function to load the last processed post ID from the file
  function loadLastProcessedPostId() {
    try {
      return fs.readFileSync(lastProcessedPostIdFile, "utf8").trim();
    } catch (error) {
      console.error("Error loading last processed post ID:", error);
      return null;
    }
  }

  // Function to save the last processed post ID to the file
  function saveLastProcessedPostId() {
    try {
      fs.writeFileSync(lastProcessedPostIdFile, `${lastProcessedPostId}`);
    } catch (error) {
      console.error("Error saving last processed post ID:", error);
    }
  }

  async function createBlueskyMessage(text) {
    const richText = new RichText({ text });
    await richText.detectFacets(agent);

    return {
      text: richText.text,
      facets: richText.facets
    };
  }

  async function postToBluesky(textParts, blueskyThread) {
    let blueskyMessage = await createBlueskyMessage(textParts[0]);
    if (blueskyThread.length > 0) {
      blueskyMessage = {
        ...blueskyMessage,
        reply: {
          root: blueskyThread[0],
          parent: blueskyThread[blueskyThread.length - 1]
        }
      };
    }
    const rootMessageResponse = await agent.post(blueskyMessage);

    if (textParts.length === 1) return rootMessageResponse;

    let replyMessageResponse = null
    for (let index = 1; index < textParts.length; index++) {
      replyMessageResponse = await agent.post({
        ...(await createBlueskyMessage(textParts[index])),
        reply: {
          root: blueskyThread.length > 0 ? blueskyThread[0] : rootMessageResponse,
          parent: replyMessageResponse ?? rootMessageResponse,
        }
      });
    }  
    return replyMessageResponse;
  }

  function removeHtmlTags(input) {
    return input.replace(/<[^>]*>/g, "");
  }

  function splitText(text, maxLength) {
    // Split the text by spaces
    const words = text.split(" ");

    let result = [];
    let currentChunk = "";

    for (const word of words) {
        // Add the current word to the current chunk
        const potentialChunk = `${currentChunk} ${word}`.trim();

        if (potentialChunk.length <= maxLength) {
            // If the current chunk is still under max length, add the word
            currentChunk = potentialChunk;
        } else {
            // Otherwise, add the current chunk to the result and start a new chunk
            result.push(currentChunk);
            currentChunk = word;
        }
    }

    // Add the last chunk to the result
    result.push(currentChunk);

    return result;
  }

  // Function to periodically fetch new Mastodon posts
  async function fetchNewPosts() {
    const response = await axios.get(
      `${mastodonInstance}/users/${mastodonUser}/outbox?page=true`
    );

    const reversed = response.data.orderedItems
      .filter((item) => item.object.type === "Note")
      .filter((item) => item.object.inReplyTo === null || item.object.inReplyTo.startsWith(`${mastodonInstance}/users/${mastodonUser}/statuses/`))
      .reverse();

    const withThreads = reversed.filter((item, i) => item.object.inReplyTo === null || (i > 0 && item.object.inReplyTo === reversed[i - 1].object.id));

    let newTimestampId = 0;

    let item = null;
    let blueskyThread = [];
    let lastBlueskyPost = null;
    for (let index = 0; index < withThreads.length; index++) {
      item = withThreads[index];
      const currentTimestampId = Date.parse(item.published);

      if (currentTimestampId > newTimestampId) {
        newTimestampId = currentTimestampId;
      }

      if (currentTimestampId > lastProcessedPostId && lastProcessedPostId != 0) {
        try {
          console.log('📧 posting to BlueSky', currentTimestampId)
          const textParts = splitText(removeHtmlTags(item.object.content), 300);
          if(item.object.inReplyTo !== null) {
            blueskyThread.push(lastBlueskyPost);
          } else {
            blueskyThread = [];
          }
          lastBlueskyPost = await postToBluesky(textParts, blueskyThread);
        } catch (error) {
          console.error('🔥 can\'t post to Bluesky', currentTimestampId, error)
        }
      }
    }

    if (newTimestampId > 0) {
      lastProcessedPostId = newTimestampId;
      saveLastProcessedPostId();
    }
  }

  fetchNewPosts();
  // Fetch new posts every 5 minutes (adjust as needed)
  setInterval(fetchNewPosts, (process.env.INTERVAL_MINUTES ?? 5) * 60 * 1000);
}

main()