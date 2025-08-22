// register-commands.js
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN; // your bot token
const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID; // your app id

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

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(APPLICATION_ID),
      { body: commands }
    );
    console.log('Successfully registered global commands.');
  } catch (err) {
    console.error('Error registering commands:', err);
  }
}
registerCommands();
