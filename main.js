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

// File to store the last processed Mastodon post ID
const lastProcessedPostIdFile = path.join(__dirname, "lastProcessedPostId.txt");

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

async function postToBluesky(text) {
  await agent.login({
    identifier: process.env.BLUESKY_HANDLE,
    password: process.env.BLUESKY_PASSWORD,
  });

  const richText = new RichText({ text });
  await richText.detectFacets(agent);
  await agent.post({
    text: richText.text,
    facets: richText.facets,
  });
}

function removeHtmlTags(input) {
  return input.replace(/<[^>]*>/g, "");
}

// Function to periodically fetch new Mastodon posts
async function fetchNewPosts() {
  const response = await axios.get(`${mastodonInstance}/users/${mastodonUser}/outbox?page=true`);

  const reversed = response.data.orderedItems.filter(item => item.object.type === 'Note')
	.filter(item => item.object.inReplyTo === null)
	.reverse();

  let newTimestampId = 0;
  
  reversed.forEach(item => {
    const currentTimestampId = Date.parse(item.published);

    if(currentTimestampId > newTimestampId) {
      newTimestampId = currentTimestampId;
    }

   if(currentTimestampId > lastProcessedPostId && lastProcessedPostId != 0) {
      const text = removeHtmlTags(item.object.content);
      postToBluesky(text);
    }
  })

  if(newTimestampId > 0) {
    lastProcessedPostId = newTimestampId;
    saveLastProcessedPostId();
  }
}

fetchNewPosts();
// Fetch new posts every 5 minutes (adjust as needed)
setInterval(fetchNewPosts, 2 * 60 * 1000);
