const Groq = require("groq-sdk");
const got = require("got");
const nacl = require("tweetnacl");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  // Verify Discord request signature
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const rawBody = JSON.stringify(req.body); // Vercel parses body automatically

  const isVerified = nacl.sign.detached.verify(
    Buffer.from(timestamp + rawBody),
    Buffer.from(signature, "hex"),
    Buffer.from(PUBLIC_KEY, "hex")
  );

  if (!isVerified) {
    res.status(401).end("invalid request signature");
    return;
  }

  const interaction = req.body;

  // Handle ping
  if (interaction.type === 1) {
    res.status(200).json({ type: 1 });
    return;
  }

  // Handle slash command
  if (interaction.type === 2) {
    const cmd = interaction.data.name.toLowerCase();
    let content = "";

    try {
      switch (cmd) {
        case "roblox": {
          const discordId = interaction.data.options.find((o) => o.name === "discord_id").value;
          const response = await got(`https://verify.eryn.io/api/user/${discordId}`, {
            timeout: { request: 5000 },
          });
          const data = JSON.parse(response.body);
          if (data.status !== "ok" || !data.robloxId) {
            content = "No Roblox account linked.";
            break;
          }
          const robloxResp = await got(`https://users.roblox.com/v1/users/${data.robloxId}`, {
            timeout: { request: 5000 },
          });
          const robloxData = JSON.parse(robloxResp.body);
          content = `Found Roblox account: ${robloxData.name} [ID: ${data.robloxId}]`;
          break;
        }

        case "groqq": {
          const prompt = interaction.data.options.find((o) => o.name === "prompt").value;
          const completion = await groq.chat.completions.create({
            model: "mixtral-8x7b-32768",
            messages: [{ role: "user", content: prompt }],
          });
          content = completion.choices[0].message.content;
          break;
        }

        case "customai": {
          const systemPrompt = interaction.data.options.find((o) => o.name === "system_prompt").value;
          const message = interaction.data.options.find((o) => o.name === "message")?.value || "";
          const messages = [{ role: "system", content: systemPrompt }];
          if (message) {
            messages.push({ role: "user", content: message });
          } else {
            content = "Custom AI chat initialized. Provide a 'message' option in your next /customai call to interact. Note: Each call is stateless; include previous context in the system prompt if needed for multi-turn conversations.";
            break;
          }
          const completion = await groq.chat.completions.create({
            model: "mixtral-8x7b-32768",
            messages,
          });
          content = completion.choices[0].message.content;
          break;
        }

        case "ping": {
          content = "Pong!";
          break;
        }

        case "help": {
          content = `
Available commands:
/roblox discord_id:<Discord ID> → Lookup linked Roblox account
/groqq prompt:<text> → Ask AI a one-off question
/customai system_prompt:<text> [message:<text>] → Custom AI response (single-turn; use system_prompt for context, optional initial message)
/ping → Test response
/help → Show this menu
          `;
          break;
        }

        default:
          content = "Unknown command.";
      }
    } catch (err) {
      content = `Error: ${err.message}`;
    }

    res.status(200).json({
      type: 4,
      data: {
        content,
        flags: 64, // Make response ephemeral (visible only to user)
      },
    });
    return;
  }

  // Unknown interaction type
  res.status(400).send("Unknown interaction type");
}
