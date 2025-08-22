import express from "express";
import DiscordOauth2 from "discord-oauth2";
import fetch from "node-fetch";
import fs from "fs-extra";

const app = express();

// --- Repository secrets ---
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

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

// --- Home route ---
app.get("/", (req, res) => {
  const url = oauth.generateAuthUrl({
    scope: ["identify", "connections"],
    responseType: "code"
  });
  res.send(`<h1>Discord OSINT + AI App</h1><a href="${url}">Authorize with Discord</a>`);
});

// --- Callback route (Vercel-ready) ---
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code provided");

  try {
    // Exchange code for token (server-side only)
    const token = await oauth.tokenRequest({
      code,
      scope: "identify connections",
      grantType: "authorization_code"
    });

    // Fetch user info & connections
    const user = await oauth.getUser(token.access_token);
    const connections = await oauth.getUserConnections(token.access_token);

    // Fetch Roblox info (Eryn API)
    const roblox = await getRobloxInfo(user.username);

    // AI summary with Groq
    const prompt = `
Analyze the public info and connections for OSINT purposes:
User: ${user.username}#${user.discriminator}
Connections: ${JSON.stringify(connections)}
Roblox info: ${JSON.stringify(roblox)}
`;
    const aiSummary = await analyzeWithGroq(prompt);

    // Save only consented public info (no token)
    await fs.ensureDir("./data");
    await fs.writeJSON(`./data/${user.id}.json`, { user, connections, roblox, aiSummary }, { spaces: 2 });

    // Respond to user
    res.send(`
      <h2>Hello, ${user.username}#${user.discriminator}</h2>
      <p>Public data saved and AI OSINT summary generated.</p>
      <pre>${aiSummary}</pre>
      ${roblox ? `<img src="${roblox.avatar}" alt="Roblox Avatar"/>` : ""}
    `);

  } catch (err) {
    console.error(err);
    res.send("Error fetching user data");
  }
});

// --- Start server ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`App running on port ${port}`));
