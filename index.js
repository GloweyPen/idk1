import express from "express";
import DiscordOauth2 from "discord-oauth2";
import fetch from "node-fetch";
import fs from "fs-extra";
import { createObjectCsvWriter } from "csv-writer";

// --- Read secrets from environment (repo secrets) ---
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
  console.error("Missing Discord OAuth2 secrets!");
  process.exit(1);
}

const app = express();
const oauth = new DiscordOauth2({
  clientId: DISCORD_CLIENT_ID,
  clientSecret: DISCORD_CLIENT_SECRET,
  redirectUri: DISCORD_REDIRECT_URI
});

// --- Roblox info fetch ---
async function getRobloxInfo(username) {
  const res = await fetch(`https://verify.eryn.io/api/user/${username}`);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    id: data.robloxId,
    username: data.robloxUsername,
    avatar: `https://www.roblox.com/outfit-thumbnail/image?userOutfitId=${data.robloxId}&width=420&height=420&format=png`
  };
}

// --- Groq AI Analysis ---
async function analyzeWithGroq(prompt) {
  if (!GROQ_API_KEY) return "Groq API key not set";
  const res = await fetch("https://api.groq.com/openai/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      input: prompt
    })
  });
  const data = await res.json();
  return data.output_text || "No AI output";
}

// --- OAuth2 Redirect ---
app.get("/", (req, res) => {
  const url = oauth.generateAuthUrl({ scope: ["identify", "connections"], responseType: "code" });
  res.send(`<h1>Discord OSINT App</h1><a href="${url}">Authorize with Discord</a>`);
});

// --- OAuth2 Callback ---
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code provided");

  try {
    const token = await oauth.tokenRequest({
      code,
      scope: "identify connections",
      grantType: "authorization_code"
    });

    const user = await oauth.getUser(token.access_token);
    const connections = await oauth.getUserConnections(token.access_token);

    // --- Example: Roblox info (if username same as Discord username) ---
    const roblox = await getRobloxInfo(user.username);

    // --- AI Summary ---
    const prompt = `Analyze the public info and connections for OSINT purposes:
User: ${user.username}#${user.discriminator}
Connections: ${JSON.stringify(connections)}
Roblox info: ${JSON.stringify(roblox)}
`;
    const aiSummary = await analyzeWithGroq(prompt);

    // Save JSON
    await fs.ensureDir("./data");
    const filePath = `./data/${user.id}.json`;
    await fs.writeJSON(filePath, { user, connections, roblox, aiSummary }, { spaces: 2 });

    res.send(`
      <h2>Hello, ${user.username}#${user.discriminator}</h2>
      <p>Data saved (user-consented)</p>
      <pre>${aiSummary}</pre>
      ${roblox ? `<img src="${roblox.avatar}" alt="Roblox Avatar"/>` : ""}
    `);

  } catch (err) {
    console.error(err);
    res.send("Error fetching user data");
  }
});

app.listen(3000, () => console.log("App running on http://localhost:3000"));
