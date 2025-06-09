const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const moment = require('moment-timezone');
const colors = require('colors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn, exec } = require('child_process');

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

const config = require('./config/config.json');

function log(text) {
    console.log(`[${moment().tz(config.timezone).format('HH')}h]`.blue, text);
}

function logError(text) {
    console.log(`[${moment().tz(config.timezone).format('HH')}h]`.red, text);
}

client.on('qr', qr => {
    log('Scan the QR code:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.clear();
    const consoleText = './config/banner.txt';
    fs.readFile(consoleText, 'utf-8', (err, data) => {
        if (err) {
            log(`${config.prefix} is ready!`);
        } else {
            console.log(data.blue);
            log(`${config.prefix} is ready!`);
        }
    });
});

client.on('message', async message => {
    const isGroup = message.from.endsWith('@g.us');
    if ((isGroup && config.groups) || !isGroup) {

        if (message.body === `${config.prefix}help`) {
            return client.sendMessage(message.from,
                `Available commands:\n` +
                `${config.prefix}yt <YouTube URL> - Download audio as MP3\n` +
                `${config.prefix}s - Create sticker from image or reply to image\n` +
                `${config.prefix}r <name> | <author> - Rename sticker (reply to sticker with this command)`
            );
        }

        if (message.body.startsWith(`${config.prefix}yt `)) {
            const url = message.body.replace(`${config.prefix}yt `, '').trim();
            console.log(`${config.prefix}yt command => ${url}`);

            if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
                return client.sendMessage(message.from, 'Please send a valid YouTube link.');
            }

            const outputPath = path.resolve(__dirname, 'ytmp3_output');
            if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath);

            client.sendMessage(message.from, 'Downloading, please wait...');

            const command = `yt-dlp -x --audio-format mp3 -o "${outputPath}/%(title)s.%(ext)s" "${url}"`;

            exec(command, async (error) => {
                if (error) {
                    console.error('yt-dlp error: ' + error.message);
                    return client.sendMessage(message.from, 'Invalid link or download failed.');
                }

                const files = fs.readdirSync(outputPath).filter(f => f.endsWith('.mp3'));
                if (files.length === 0) return client.sendMessage(message.from, 'Download failed.');

                const mp3File = path.join(outputPath, files[0]);

                try {
                    const media = MessageMedia.fromFilePath(mp3File);
                    await client.sendMessage(message.from, media);
                    fs.unlinkSync(mp3File);
                } catch (err) {
                    console.error('Error sending MP3: ' + err);
                    client.sendMessage(message.from, 'Failed to send the file.');
                }
            });
            return;
        }

        if (message.type === "video" || message.type === "gif") {
            return;
        }

        if (message.body === `${config.prefix}s`) {
            if (message.hasMedia && message.type === 'image') {
                try {
                    const media = await message.downloadMedia();
                    await client.sendMessage(message.from, media, {
                        sendMediaAsSticker: true,
                        stickerName: config.name,
                        stickerAuthor: config.author
                    });
                } catch {
                    client.sendMessage(message.from, "Failed to create sticker.");
                }
            } else if (message.hasQuotedMsg) {
                const quotedMsg = await message.getQuotedMessage();
                if (quotedMsg.type !== 'image') {
                    return client.sendMessage(message.from, "You can only create stickers from images.");
                }
                if (quotedMsg.hasMedia) {
                    try {
                        const media = await quotedMsg.downloadMedia();
                        await client.sendMessage(message.from, media, {
                            sendMediaAsSticker: true,
                            stickerName: config.name,
                            stickerAuthor: config.author
                        });
                    } catch {
                        client.sendMessage(message.from, "Failed to create sticker.");
                    }
                } else {
                    client.sendMessage(message.from, "Please reply to a media.");
                }
            } else {
                client.sendMessage(message.from, "Send an image with the command or reply to an image with the command.");
            }
            return;
        }

        if (message.body.startsWith(`${config.prefix}r`)) {
            if (message.body.includes('|')) {
                let name = message.body.split('|')[0].replace(message.body.split(' ')[0], '').trim();
                let author = message.body.split('|')[1].trim();
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
                        } catch {
                            client.sendMessage(message.from, "Failed to rename.");
                        }
                    } else {
                        client.sendMessage(message.from, "Reply to a sticker or image.");
                    }
                } else {
                    client.sendMessage(message.from, "Reply to a sticker or image.");
                }
            } else {
                client.sendMessage(message.from, `Usage: ${config.prefix}r <name> | <author>`);
            }
            return;
        }

        const chat = await client.getChatById(message.id.remote);
        await chat.sendSeen();
    }
});

client.initialize();
