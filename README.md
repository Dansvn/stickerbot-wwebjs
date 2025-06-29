# WhatsApp Audio & Sticker Bot for Termux

A simple WhatsApp bot built with `whatsapp-web.js` that lets you:

- Download YouTube audio as MP3 by sending a YouTube link with a command.
- Create stickers from images (sent or replied).
- Rename stickers with custom name and author.

---

## Features

- YouTube audio download as MP3 (`!yt <YouTube URL>`)
- Create stickers from images (`!s`)
- Rename stickers by replying to them (`!r <name> | <author>`)
- Works on WhatsApp Web via `whatsapp-web.js`
- Designed primarily for Termux, tested also on Denian Linux via PRoot.


---

## Requirements

- Node.js 16+ installed.
- `yt-dlp` installed and available in your system.
- Chromium browser installed.
- Termux environment (recommended) or Debian Linux with PRoot.
- Internet connection.
- WhatsApp account to scan QR code.

---

## Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/Dansvn/stickerbot-wwebjs.git
cd stickerbot-wwebjs
```

### 2. Install dependencies without Puppeteer Chromium download

```bash
PUPPETEER_SKIP_DOWNLOAD=true npm install
```

### 3. Install Chromium browser

- Debian (with PRoot):

```bash
apt install chromium
```

Make sure Chromium is installed at `/usr/bin/chromium` or adjust `executablePath` in `main.js`.

### 4. Install yt-dlp

```bash
pip install -U yt-dlp
```

Or download from:  
https://github.com/yt-dlp/yt-dlp#installation  
Ensure `yt-dlp` works in terminal.

### 5. Configure the bot (optional)

You can edit `config/config.json` to customize settings, but the bot works fine with default values:

```json
{
  "name": "sticker",
  "author": "Dansvn",
  "prefix": "!",
  "timezone": "Asia/Tokyo",
  "groups": true,
  "log": true
}
```

- `name` and `author` are sticker metadata.
- `prefix` is the command prefix.
- `timezone` is used for logging timestamps.
- `groups` enables or disables group messages.
- `log` enables or disables console logging.

### 6. Run the bot

```bash
node .
```

---

## Using the Bot

- Start WhatsApp and scan the QR code shown in the terminal to connect.
- Send commands in chat using the configured prefix (default is `!`).
- Send `!help` to get a list of available commands.
- Available commands:
  - `!yt <YouTube URL>` — Download audio as MP3 from YouTube.
  - `!s` — Create a sticker from an image you send or reply to.
  - `!r <name> | <author>` — Rename a sticker by replying to it with this command.
- The bot works in groups if enabled in the config.
- If an error happens during a command, the bot will notify you.

*Disclaimer:*  
This bot was made quickly for a friend, so it’s simple and straightforward.

---

## About

This bot is simple and I made it just for a friend. It’s a quick and practical tool to download YouTube audio and create stickers on WhatsApp.

---

## Contact

If you have any questions or need support, feel free to reach out!  
**My social links:** [ayo.so/dansvn](https://ayo.so/dansvn)
