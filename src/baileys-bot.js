// src/baileys-bot.js
require('dotenv').config();
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, downloadMediaMessage, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs-extra');
const { Boom } = require('@hapi/boom');
const pino = require('pino');

const WhisperClient = require('./whisper-client');
const { getAssistedResponse } = require('./ai-assistant');
const { searchProperties } = require('./property-db');
const logger = require('./utils/logger');

const whisperClient = new WhisperClient();
const tempDir = process.env.TEMP_DIR || './temp';
const processingJobs = new Map();
const botStartTime = Math.floor(Date.now() / 1000);
const conversationHistories = new Map();

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({ auth: state, printQRInTerminal: true, logger: pino({ level: 'silent' }) });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') logger.info('✅ Conexão estabelecida!');
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        const messageTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp?.low;
        if (!msg.message || msg.key.fromMe || messageTimestamp < botStartTime) return;

        const chatId = msg.key.remoteJid;
        const audioMessage = msg.message.audioMessage;
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (processingJobs.get(chatId)) {
            await sock.sendMessage(chatId, { text: 'Estou terminando sua última solicitação. Um momento, por favor.' });
            return;
        }

        try {
            processingJobs.set(chatId, true);
            let userInput = null;

            if (audioMessage) {
                logger.info(`Recebido ÁUDIO de ${chatId}`);
                userInput = await handleAudioMessage(sock, msg);
            } else if (textMessage) {
                logger.info(`Recebido TEXTO de ${chatId}: "${textMessage}"`);
                userInput = textMessage;
            }

            if (userInput) {
                await generateAndSendAiResponse(sock, msg, userInput);
            }

        } catch (error) {
            logger.error(`Erro fatal: ${error}`);
        } finally {
            processingJobs.delete(chatId);
        }
    });
}

async function handleAudioMessage(sock, msg) {
    // >>>>> MUDANÇA: A LINHA ABAIXO FOI REMOVIDA PARA UMA INTERAÇÃO MAIS DIRETA <<<<<
    // await sock.sendMessage(msg.key.remoteJid, { text: '🎙️ Olá! Sou o Léo. Recebi seu áudio e já estou verificando para você...' }, { quoted: msg });
    let tempPath = null;
    try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }).child({ level: 'silent' }) });
        if (buffer.length > 25 * 1024 * 1024) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Áudio muito grande (máx 25MB).' });
            return null;
        }
        const timestamp = Date.now();
        tempPath = path.join(tempDir, `audio_${timestamp}.ogg`);
        await fs.ensureDir(tempDir);
        await fs.writeFile(tempPath, buffer);
        const transcriptionResult = await whisperClient.transcribeAudio(tempPath);
        if (!transcriptionResult.success || !transcriptionResult.text) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Não consegui entender o áudio.' });
            return null;
        }
        logger.info(`Transcrição: "${transcriptionResult.text}"`);
        return transcriptionResult.text;
    } finally {
        if (tempPath) await fs.unlink(tempPath).catch(e => logger.warn(`Falha ao limpar arquivo: ${e}`));
    }
}

async function generateAndSendAiResponse(sock, originalMessage, userInput) {
    const chatId = originalMessage.key.remoteJid;
    
    if (!conversationHistories.has(chatId)) {
        conversationHistories.set(chatId, []);
    }
    const history = conversationHistories.get(chatId);
    history.push({ role: "user", content: userInput });

    try {
        // >>>>> MUDANÇA PRINCIPAL: A LINHA ABAIXO FOI REMOVIDA <<<<<
        // await sock.sendMessage(chatId, { text: '🤖 Ok, entendi. Deixe-me pensar na melhor resposta...' }, { quoted: originalMessage });
        
        const botResponseText = await getAssistedResponse(history);
        
        history.push({ role: "assistant", content: botResponseText });

        const propertyIds = botResponseText.match(/ID: ([\w\d]+)/g)?.map(id => id.replace('ID: ', ''));
        
        // Envia a resposta principal primeiro
        await sock.sendMessage(chatId, { text: botResponseText }, { quoted: originalMessage });
        
        // Em seguida, se houver fotos, envia-as
        if (propertyIds && propertyIds.length > 0) {
            const allProperties = await searchProperties({});
            for (const id of propertyIds) {
                const property = allProperties.find(p => p.id === id);
                if (property && property.photos && property.photos.length > 0) {
                    // Pequeno delay para garantir que a mensagem de texto chegue antes das fotos
                    await new Promise(resolve => setTimeout(resolve, 500)); 
                    await sock.sendMessage(chatId, { text: `Aqui estão algumas fotos do imóvel *${id}*:` });
                    for (const photoUrl of property.photos) {
                        await sock.sendMessage(chatId, { image: { url: photoUrl } });
                    }
                }
            }
        }

    } catch (error) {
        logger.error(`Erro ao obter resposta da IA: ${error}`);
        await sock.sendMessage(chatId, { text: `❌ Ocorreu um erro técnico.` }, { quoted: originalMessage });
    }
}

logger.info("Iniciando o bot assistente imobiliário v2.2...");
connectToWhatsApp();