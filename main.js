const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const moment = require('moment-timezone');
const colors = require('colors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const sharp = require('sharp');

const config = require('./config/config.json');

function log(text) {
    console.log(`[${moment().tz(config.timezone).format('HH')}h]`.blue, text);
}

function logError(text) {
    console.log(`[${moment().tz(config.timezone).format('HH')}h]`.red, text);
}

const client = new Client({
    restartOnAuthFail: true,
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-features=VizDisplayCompositor',
            '--window-size=1280,800'
        ]
    },
    webVersionCache: {
        type: 'remote',
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.5.html",
    },
    authStrategy: new LocalAuth({ clientId: "client" })
});

client.on('qr', qr => {
    log('Scan the QR code:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.clear();
    const bannerPath = './config/banner.txt';
    fs.readFile(bannerPath, 'utf-8', (err, data) => {
        if (err) {
            log(`${config.prefix} is ready!`);
        } else {
            console.log(data.blue);
            log(`${config.prefix} is ready!`);
        }
    });
});

async function processImageStretch(media) {
    const tempInput = path.join(os.tmpdir(), 'input.webp');
    const tempOutput = path.join(os.tmpdir(), 'output.webp');

    try {
        fs.writeFileSync(tempInput, Buffer.from(media.data, 'base64'));

        await sharp(tempInput)
            .resize(512, 512, { fit: 'fill' })  
            .webp()
            .toFile(tempOutput);
    } finally {
        if (fs.existsSync(tempInput)) {
            try {
                fs.unlinkSync(tempInput);
            } catch {}
        }
    }

    return tempOutput;
}

const getVideoDuration = (input) => {
  return new Promise((resolve, reject) => {
    exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${input}"`, (err, stdout) => {
      if (err) reject(err);
      else resolve(parseFloat(stdout));
    });
  });
};

async function processVideoStretch(media) {
  const tempInput = path.join(os.tmpdir(), 'input.mp4');
  const tempTrimmed = path.join(os.tmpdir(), 'trimmed.mp4');
  const tempOutput = path.join(os.tmpdir(), 'output.webp');

  fs.writeFileSync(tempInput, Buffer.from(media.data, 'base64'));

  let duration = await getVideoDuration(tempInput);
  if(duration > 6) {
    await new Promise((resolve, reject) => {
      exec(`ffmpeg -y -i "${tempInput}" -t 6 -c copy "${tempTrimmed}"`, (err) => {
        if(err) reject(err);
        else resolve();
      });
    });
  } else {
    fs.copyFileSync(tempInput, tempTrimmed);
  }

  return new Promise((resolve, reject) => {
    const cmd = `ffmpeg -y -i "${tempInput}" \
-vf "fps=10,scale=512:512,setdar=1,format=yuv420p" \
-an -vsync 0 -loop 0 -t 5 -c:v libwebp -lossless 0 -qscale 75 -preset picture -compression_level 6 "${tempOutput}"`;

    exec(cmd, (error) => {
      try { fs.unlinkSync(tempInput); } catch {}
      try { fs.unlinkSync(tempTrimmed); } catch {}

      if (error) {
        return reject(new Error("Error processing video with ffmpeg: " + error.message));
      }

      if (!fs.existsSync(tempOutput)) {
        return reject(new Error("Output file not found: output.webp"));
      }

      resolve(tempOutput);
    });
  });
}

const queue = [];
let processing = false;

async function processQueue() {
    if (processing) return;
    if (queue.length === 0) return;

    processing = true;
    const { message, targetMsg, config } = queue.shift();

    try {
        const media = await targetMsg.downloadMedia();

        let stickerPath;

        const mimetype = targetMsg._data?.mimetype || '';
        const isGif = mimetype === 'image/gif';
        const isImage = mimetype.startsWith('image/') && !isGif;
        const isVideo = mimetype.startsWith('video/');

        if (isImage) {
            stickerPath = await processImageStretch(media);
        } else if (isVideo || isGif) {
            stickerPath = await processVideoStretch(media);
        }

        const stickerMedia = MessageMedia.fromFilePath(stickerPath);
        await client.sendMessage(message.from, stickerMedia, {
            sendMediaAsSticker: true,
            stickerName: config.name,
            stickerAuthor: config.author
        });

        fs.unlinkSync(stickerPath);

        if (config.log) log('Sticker created and sent via queue.');

    } catch (e) {
        if (config.log) logError('Failed to create sticker: ' + e.message);
        client.sendMessage(message.from, "Failed to create sticker.");
    }

    processing = false;
    processQueue();
}

client.on('message', async message => {
    const isGroup = message.from.endsWith('@g.us');
    const prefix = config.prefix;

    if (message.body && message.body.startsWith(prefix)) {
        if (message.body === `${prefix}help`) {
            return client.sendMessage(message.from,
                `Available commands:\n` +
                `${prefix}yt <YouTube URL> - Download audio as MP3\n` +
                `${prefix}s - Create sticker from image/video or reply\n` +
                `${prefix}r <name> | <author> - Rename sticker (reply required)`
            );
        }

        if (message.body.startsWith(`${prefix}yt `)) {
            const url = message.body.slice((prefix + "yt ").length).trim();
            if (config.log) log(`${prefix}yt command received => ${url}`);

            if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
                return client.sendMessage(message.from, 'Please send a valid YouTube link.');
            }

            const outputPath = path.resolve(__dirname, 'ytmp3_output');
            if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath);

            client.sendMessage(message.from, 'Downloading, please wait...');
            if (config.log) log('Started downloading audio from YouTube...');

            const command = `yt-dlp -x --audio-format mp3 -o "${outputPath}/%(title)s.%(ext)s" "${url}"`;

            exec(command, async (error) => {
                if (error) {
                    if (config.log) logError('yt-dlp error: ' + error.message);
                    return client.sendMessage(message.from, 'Invalid link or download failed.');
                }

                const files = fs.readdirSync(outputPath).filter(f => f.endsWith('.mp3'));
                if (files.length === 0) {
                    if (config.log) logError('No MP3 file found after yt-dlp execution.');
                    return client.sendMessage(message.from, 'Download failed.');
                }

                const mp3File = path.join(outputPath, files[0]);
                if (config.log) log(`MP3 file ready: ${mp3File}`);

                try {
                    const media = MessageMedia.fromFilePath(mp3File);
                    await client.sendMessage(message.from, media);
                    fs.unlinkSync(mp3File);
                    if (config.log) log(`MP3 sent and deleted: ${files[0]}`);
                } catch (err) {
                    if (config.log) logError('Error sending MP3: ' + err);
                    client.sendMessage(message.from, 'Failed to send the file.');
                }
            });
            return;
        }

        if (message.body.startsWith(`${prefix}r`)) {
            if (message.body.includes('|')) {
                let parts = message.body.split('|');
                let name = parts[0].replace(`${prefix}r`, '').trim();
                let author = parts[1].trim();
                if (config.log) log(`Renaming sticker: name = ${name}, author = ${author}`);

                if (message.hasQuotedMsg) {
                    const quotedMsg = await message.getQuotedMessage();
                    if (quotedMsg.type !== 'image' && quotedMsg.type !== 'sticker') {
                        return client.sendMessage(message.from, "Only stickers or images can be renamed.");
                    }
                    if (quotedMsg.hasMedia) {
                        try {
                            const media = await quotedMsg.downloadMedia();
                            await client.sendMessage(message.from, media, {
                                sendMediaAsSticker: true,
                                stickerName: name,
                                stickerAuthor: author
                            });
                            if (config.log) log('Sticker renamed and sent.');
                        } catch {
                            if (config.log) logError('Failed to rename sticker.');
                            client.sendMessage(message.from, "Failed to rename.");
                        }
                    } else {
                        client.sendMessage(message.from, "Reply to a sticker or image.");
                    }
                } else {
                    client.sendMessage(message.from, "Reply to a sticker or image.");
                }
            } else {
                client.sendMessage(message.from, `Usage: ${prefix}r <name> | <author>`);
            }
            return;
        }

        if (message.body === `${prefix}s`) {
            let targetMsg = message;

            if (message.hasQuotedMsg) {
                targetMsg = await message.getQuotedMessage();
            }

            const mimetype = targetMsg._data?.mimetype || '';
            const isGif = mimetype === 'image/gif';
            const isImage = mimetype.startsWith('image/') && !isGif;
            const isVideo = mimetype.startsWith('video/');
            const isValidMedia = targetMsg.hasMedia && (isImage || isVideo || isGif);

            if (!isValidMedia) {
                return client.sendMessage(message.from, "Send an image/video or reply to one using the command.");
            }

            queue.push({ message, targetMsg, config });
            processQueue();

            return;
        }
    }

    if (!isGroup && message.hasMedia) {
        const mimetype = message._data?.mimetype || "";
        const isImage = mimetype.startsWith("image/");
        const isVideo = mimetype.startsWith("video/");

        if (isImage || isVideo) {
            queue.push({ message, targetMsg: message, config });
            processQueue();
            return;
        }
    }

    const chat = await client.getChatById(message.id.remote);
    await chat.sendSeen();
});

client.initialize();
