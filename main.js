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

    fs.writeFileSync(tempInput, Buffer.from(media.data, 'base64'));

    await sharp(tempInput)
        .resize(512, 512, { fit: 'fill' }) 
        .webp()
        .toFile(tempOutput);

    return tempOutput;
}

async function processVideoStretch(media) {
    return new Promise((resolve, reject) => {
        const tempInput = path.join(os.tmpdir(), 'input.mp4');
        const tempOutput = path.join(os.tmpdir(), 'output.mp4');

        fs.writeFileSync(tempInput, Buffer.from(media.data, 'base64'));

        const cmd = `ffmpeg -y -i "${tempInput}" -vf "scale=512:512" -c:a copy "${tempOutput}"`;
        exec(cmd, (error) => {
            fs.unlinkSync(tempInput);

            if (error) {
                reject(error);
            } else {
                resolve(tempOutput);
            }
        });
    });
}

client.on('message', async message => {
    const isGroup = message.from.endsWith('@g.us');

    if (isGroup && config.groups) {
        if (message.body === `${config.prefix}help`) {
            return client.sendMessage(message.from,
                `Available commands:\n` +
                `${config.prefix}yt <YouTube URL> - Download audio as MP3\n` +
                `${config.prefix}s - Create sticker from image/video or reply\n` +
                `${config.prefix}r <name> | <author> - Rename sticker (reply required)`
            );
        }

        if (message.body.startsWith(`${config.prefix}yt `)) {
            const url = message.body.replace(`${config.prefix}yt `, '').trim();
            if (config.log) log(`${config.prefix}yt command received => ${url}`);

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

        if (message.body === `${config.prefix}s`) {
            let targetMsg = message;

            if (message.hasQuotedMsg) {
                targetMsg = await message.getQuotedMessage();
            }

            const isValidMedia = targetMsg.hasMedia && (
                targetMsg.type === 'image' ||
                targetMsg.type === 'video' ||
                targetMsg._data?.isGif
            );

            if (!isValidMedia) {
                return client.sendMessage(message.from, "Send an image/video or reply to one using the command.");
            }

            try {
                const media = await targetMsg.downloadMedia();

                if (targetMsg.type === 'image' || targetMsg._data?.isGif) {
                    const stickerPath = await processImageStretch(media);
                    const stickerMedia = MessageMedia.fromFilePath(stickerPath);
                    await client.sendMessage(message.from, stickerMedia, {
                        sendMediaAsSticker: true,
                        stickerName: config.name,
                        stickerAuthor: config.author
                    });
                    fs.unlinkSync(stickerPath);
                } else if (targetMsg.type === 'video') {
                    const stickerPath = await processVideoStretch(media);
                    const stickerMedia = MessageMedia.fromFilePath(stickerPath);
                    await client.sendMessage(message.from, stickerMedia, {
                        sendMediaAsSticker: true,
                        stickerName: config.name,
                        stickerAuthor: config.author
                    });
                    fs.unlinkSync(stickerPath);
                } else {
                    await client.sendMessage(message.from, media, {
                        sendMediaAsSticker: true,
                        stickerName: config.name,
                        stickerAuthor: config.author
                    });
                }

                if (config.log) log('Sticker created and sent via command.');
            } catch (e) {
                if (config.log) logError('Failed to create sticker.');
                client.sendMessage(message.from, "Failed to create sticker.");
            }
            return;
        }

        if (message.body.startsWith(`${config.prefix}r`)) {
            if (message.body.includes('|')) {
                let name = message.body.split('|')[0].replace(message.body.split(' ')[0], '').trim();
                let author = message.body.split('|')[1].trim();
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
                client.sendMessage(message.from, `Usage: ${config.prefix}r <name> | <author>`);
            }
            return;
        }

        const chat = await client.getChatById(message.id.remote);
        await chat.sendSeen();
    }


    else if (!isGroup) {
        if (message.hasMedia) {
            const mimetype = message._data?.mimetype || "";
            const isImage = mimetype.startsWith("image/");
            const isVideo = mimetype.startsWith("video/");

            if (isImage || isVideo) {
                try {
                    const media = await message.downloadMedia();
                    if (isImage) {
                        const stickerPath = await processImageStretch(media);
                        const stickerMedia = MessageMedia.fromFilePath(stickerPath);
                        await client.sendMessage(message.from, stickerMedia, {
                            sendMediaAsSticker: true,
                            stickerName: config.name,
                            stickerAuthor: config.author
                        });
                        fs.unlinkSync(stickerPath);
                    } else if (isVideo) {
                        const stickerPath = await processVideoStretch(media);
                        const stickerMedia = MessageMedia.fromFilePath(stickerPath);
                        await client.sendMessage(message.from, stickerMedia, {
                            sendMediaAsSticker: true,
                            stickerName: config.name,
                            stickerAuthor: config.author
                        });
                        fs.unlinkSync(stickerPath);
                    }
                    if (config.log) log('Sticker automatically created in DM.');
                } catch (e) {
                    if (config.log) logError('Failed to create sticker in DM.');
                    client.sendMessage(message.from, "Failed to create sticker.");
                }
                return;
            }
        }
    }
});

client.initialize();
