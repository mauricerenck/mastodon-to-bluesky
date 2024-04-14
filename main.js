require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { RichText, BskyAgent } = require("@atproto/api");
const axios = require("axios");

// Mastodon credentials
const mastodonInstance = process.env.MASTODON_INSTANCE;
const mastodonUser = process.env.MASTODON_USER;

// Bluesky agent
const agent = new BskyAgent({ service: process.env.BLUESKY_ENDPOINT });
await agent.login({
  identifier: process.env.BLUESKY_HANDLE,
  password: process.env.BLUESKY_PASSWORD,
});

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

async function postToBluesky(text, images) {
  const richText = new RichText({ text });
  await richText.detectFacets(agent);

  const blueSkyImages = await images.reduce(async (list, {url, alt}) => {
    const imageResponse = await axios.get({ 
      url, 
      method: 'GET',
      responseType: 'blob',
     });

     const uploadResponse = await agent.uploadBlob(imageResponse.data);

     return [
      ...list, 
      {
        alt,
        image: uploadResponse.blob, 
      }
    ];
  }, []);

  await agent.post({
    text: richText.text,
    facets: richText.facets,
    ...(blueSkyImages.length > 0
      ? {
        embed: {
          type: 'app.bsky.embed.images',
          images: blueSkyImages,
        }
      }
      : {}
    ),
  });
}

function removeHtmlTags(input) {
  return input.replace(/<[^>]*>/g, "");
}

function truncate(text, timestampId) {
  if (text.length > 300) {
    console.warn(`✂ post '${timestampId}' was truncated`)
    return text.substring(0, 299) + '…'
  }

  return text
}

// Function to periodically fetch new Mastodon posts
async function fetchNewPosts() {
  const response = await axios.get(
    `${mastodonInstance}/users/${mastodonUser}/outbox?page=true`
  );

  const reversed = response.data.orderedItems
    .filter((item) => item.object.type === "Note")
    .filter((item) => item.object.inReplyTo === null)
    .reverse();

  let newTimestampId = 0;

  reversed.forEach((item) => {
    const currentTimestampId = Date.parse(item.published);

    if (currentTimestampId > lastProcessedPostId && lastProcessedPostId != 0) {
      try {
        console.log('📧 posting to BlueSky', currentTimestampId)
        const text = truncate(removeHtmlTags(item.object.content), currentTimestampId);

        const images = item.attachment
          .filter(attachment => attachment.type === 'Document' && attachment.mediaType.startsWith('image/'))
          .map(({name: alt, url}) => ({ alt, url }));
        postToBluesky(text, images);

        if (currentTimestampId > newTimestampId) {
          newTimestampId = currentTimestampId;
        }
      } catch (error) {
        console.error('🔥 can\'t post to Bluesky', currentTimestampId, error)
      }
    }
  });

  if (newTimestampId > 0) {
    lastProcessedPostId = newTimestampId;
    saveLastProcessedPostId();
  }
}

fetchNewPosts();
// Fetch new posts every 5 minutes (adjust as needed)
setInterval(fetchNewPosts, (process.env.INTERVAL_MINUTES ?? 5) * 60 * 1000);
