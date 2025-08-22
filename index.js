const express = require('express');
const nacl = require('tweetnacl');
const got = require('got');
const Groq = require('groq-sdk');
const { REST, Routes } = require('discord.js');

const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID; // Your application ID
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY; // Your application's public key
const PORT = process.env.PORT || 3000;

const GROQ_API_KEY = process.env.GROQ_API_KEY; // Your API key stored in env variable

// Initialize Groq SDK with API key from environment variable
const groq = new Groq({ apiKey: GROQ_API_KEY });

// Define commands
const commands = [
  {
    name: "roblox",
    description: "Lookup linked Roblox account",
    options: [
      {
        name: "discord_id",
        type: 3,
        description: "Discord user ID",
        required: true,
      },
    ],
  },
  {
    name: "groqq",
    description: "Ask AI a question",
    options: [
      {
        name: "prompt",
        type: 3,
        description: "Your prompt",
        required: true,
      },
    ],
  },
  {
    name: "customai",
    description: "Custom AI response",
    options: [
      {
        name: "system_prompt",
        type: 3,
        description: "System prompt for context",
        required: true,
      },
      {
        name: "message",
        type: 3,
        description: "Initial message (optional)",
        required: false,
      },
    ],
  },
  {
    name: "ping",
    description: "Test response",
    options: [],
  },
  {
    name: "help",
    description: "Show help menu",
    options: [],
  },
];

// Function to register commands with Discord
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_APPLICATION_ID),
      { body: commands }
    );
    console.log('Successfully registered commands.');
  } catch (err) {
    console.error('Error registering commands:', err);
  }
}

// Signature verification
function verifySignature(req, bodyBuffer) {
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  if (!signature || !timestamp) return false;

  return nacl.sign.detached.verify(
    Buffer.from(timestamp + bodyBuffer),
    Buffer.from(signature, 'hex'),
    Buffer.from(PUBLIC_KEY, 'hex')
  );
}

// Express app setup
const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

app.post('/interactions', async (req, res) => {
  if (!verifySignature(req, req.rawBody)) {
    return res.status(401).send('Invalid request signature');
  }

  const interaction = req.body;

  // PING
  if (interaction.type === 1) {
    return res.json({ type: 1 });
  }

  // Application Command
  if (interaction.type === 2) {
    const { name, options } = interaction.data;
    const commandName = name.toLowerCase();

    try {
      switch (commandName) {
        case 'ping':
          return res.json({ type: 4, data: { content: 'Pong!', flags: 64 } });
        case 'help':
          return res.json({
            type: 4,
            data: {
              content: `
Available commands:
- /roblox discord_id:<Discord ID> → Lookup linked Roblox account
- /groqq prompt:<text> → Ask AI a question
- /customai system_prompt:<text> [message:<text>] → Custom AI response (single-turn)
- /ping → Test response
- /help → Show this menu
              `,
              flags: 64,
            },
          });
        case 'roblox': {
          const discordId = options.find(o => o.name === 'discord_id').value;
          const response = await got(`https://verify.eryn.io/api/user/${discordId}`, { timeout: { request: 5000 } });
          const data = JSON.parse(response.body);
          if (data.status !== 'ok' || !data.robloxId) {
            return res.json({ type: 4, data: { content: 'No Roblox account linked.', flags: 64 } });
          }
          const robloxResp = await got(`https://users.roblox.com/v1/users/${data.robloxId}`, { timeout: { request: 5000 } });
          const robloxData = JSON.parse(robloxResp.body);
          return res.json({ type: 4, data: { content: `Found Roblox account: ${robloxData.name} [ID: ${data.robloxId}]`, flags: 64 } });
        }
        case 'groqq': {
          const prompt = options.find(o => o.name === 'prompt').value;
          const completion = await groq.chat.completions.create({
            model: 'mixtral-8x7b-32768',
            messages: [{ role: 'user', content: prompt }],
          });
          const replyContent = completion.choices[0].message.content;
          return res.json({ type: 4, data: { content: replyContent, flags: 64 } });
        }
        case 'customai': {
          const systemPrompt = options.find(o => o.name === 'system_prompt').value;
          const messageOpt = options.find(o => o.name === 'message')?.value;
          const messages = [{ role: 'system', content: systemPrompt }];
          if (messageOpt) {
            messages.push({ role: 'user', content: messageOpt });
          } else {
            return res.json({ type: 4, data: { content: "Custom AI chat initialized. Provide a 'message' option to interact.", flags: 64 } });
          }
          const completion = await groq.chat.completions.create({
            model: 'mixtral-8x7b-32768',
            messages,
          });
          const replyContent = completion.choices[0].message.content;
          return res.json({ type: 4, data: { content: replyContent, flags: 64 } });
        }
        default:
          return res.json({ type: 4, data: { content: 'Unknown command.', flags: 64 } });
      }
    } catch (err) {
      console.error(err);
      return res.json({ type: 4, data: { content: `Error: ${err.message}`, flags: 64 } });
    }
  }

  res.status(400).send('Unknown interaction type');
});

// Register commands on startup
(async () => {
  await registerCommands();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
})();
