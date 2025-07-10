// backend/src/baileys-bot.js
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
const FollowUpManager = require('./follow-up');

// Importar database e serviço de conversas
const { testConnection } = require('./database');
const ConversationService = require('./services/conversationService');

const whisperClient = new WhisperClient();
const tempDir = process.env.TEMP_DIR || './temp';
const processingJobs = new Map();
const botStartTime = Math.floor(Date.now() / 1000);
const conversationHistories = new Map();
const lastMessageTime = new Map();
const conversationStates = new Map();

// Instância do serviço de conversas
const conversationService = new ConversationService();

async function connectToWhatsApp() {
    // Primeiro testa conexão com o banco
    const dbConnected = await testConnection();
    if (!dbConnected) {
        logger.error('Não foi possível conectar ao banco de dados. Encerrando...');
        process.exit(1);
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({ auth: state, printQRInTerminal: true, logger: pino({ level: 'silent' }) });

    // Inicializa o gerenciador de follow-up
    const followUpManager = new FollowUpManager(sock);
    followUpManager.startFollowUpScheduler();

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') logger.info('✅ Conexão WhatsApp estabelecida!');
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        const messageTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp?.low;
        if (!msg.message || msg.key.fromMe || messageTimestamp < botStartTime) return;

        const chatId = msg.key.remoteJid;
        const audioMessage = msg.message.audioMessage;
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        // Rate limiting
        const now = Date.now();
        if (lastMessageTime.get(chatId) && now - lastMessageTime.get(chatId) < 1000) {
            return;
        }
        lastMessageTime.set(chatId, now);

        // Comando de reset
        if (textMessage === '/reset') {
            conversationHistories.delete(chatId);
            conversationStates.delete(chatId);
            await sock.sendMessage(chatId, { text: "🔄 Conversa reiniciada! Como posso ajudar você a encontrar o imóvel dos seus sonhos?" });
            return;
        }

        if (processingJobs.get(chatId)) {
            await sock.sendMessage(chatId, { text: 'Um momento, estou finalizando sua última solicitação... 🏃‍♂️' });
            return;
        }

        try {
            processingJobs.set(chatId, true);

            // Criar ou buscar contato no banco
            const pushName = msg.pushName || null;
            const contato = await conversationService.findOrCreateContact(chatId, pushName);
            
            // Criar ou buscar conversa
            const conversa = await conversationService.findOrCreateConversation(contato.id);

            let userInput = null;
            let messageMetadata = {};

            if (audioMessage) {
                logger.info(`Recebido ÁUDIO de ${chatId}`);
                const transcription = await handleAudioMessage(sock, msg);
                if (transcription) {
                    userInput = transcription;
                    messageMetadata = {
                        tipo: 'audio',
                        transcricao: transcription,
                        duracao: audioMessage.seconds
                    };
                }
            } else if (textMessage) {
                logger.info(`Recebido TEXTO de ${chatId}: "${textMessage}"`);
                userInput = textMessage;
                messageMetadata = { tipo: 'texto' };
            }

            if (userInput) {
                // Salvar mensagem do contato no banco
                await conversationService.saveMessage(
                    conversa.id, 
                    userInput, 
                    'contato', 
                    messageMetadata
                );

                // Atualizar score do contato
                await conversationService.updateContactScore(contato.id, 'message_sent');

                // Gerar resposta do bot
                await generateAndSendAiResponse(sock, msg, userInput, followUpManager, contato, conversa);
            }

        } catch (error) {
            logger.error(`Erro fatal: ${error}`);
            await sock.sendMessage(chatId, { 
                text: '❌ Ops! Tive um probleminha técnico. Pode repetir sua mensagem?' 
            });
        } finally {
            processingJobs.delete(chatId);
        }
    });
}

async function handleAudioMessage(sock, msg) {
    let tempPath = null;
    try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { 
            logger: pino({ level: 'silent' }).child({ level: 'silent' }) 
        });
        
        if (buffer.length > 25 * 1024 * 1024) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Áudio muito grande (máx 25MB). Tente enviar um áudio menor!' 
            });
            return null;
        }
        
        const timestamp = Date.now();
        tempPath = path.join(tempDir, `audio_${timestamp}.ogg`);
        await fs.ensureDir(tempDir);
        await fs.writeFile(tempPath, buffer);
        
        const transcriptionResult = await whisperClient.transcribeAudio(tempPath);
        
        if (!transcriptionResult.success || !transcriptionResult.text) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: '❌ Não consegui entender o áudio. Pode repetir?' 
            });
            return null;
        }
        
        logger.info(`Transcrição: "${transcriptionResult.text}"`);
        return transcriptionResult.text;
    } catch (error) {
        logger.error(`Erro ao processar áudio: ${error.message}`);
        return null;
    } finally {
        if (tempPath) {
            await fs.unlink(tempPath).catch(e => logger.warn(`Falha ao limpar arquivo: ${e}`));
        }
    }
}

async function generateAndSendAiResponse(sock, originalMessage, userInput, followUpManager, contato, conversa) {
    const chatId = originalMessage.key.remoteJid;
    
    if (!conversationHistories.has(chatId)) {
        conversationHistories.set(chatId, []);
    }
    const history = conversationHistories.get(chatId);
    
    const conversationState = conversationStates.get(chatId) || { stage: 'initial' };
    
    history.push({ role: "user", content: userInput });
    
    const contextualHistory = [
        ...history,
        { 
            role: "system", 
            content: `Estado atual da conversa: ${JSON.stringify(conversationState)}. ` +
                    `Mensagens no histórico: ${history.length}. ` +
                    `Nome do cliente: ${contato.nome}. ` +
                    `Score do lead: ${contato.score}/100. ` +
                    `IMPORTANTE: Seja assertivo e direto. Após mostrar imóveis, SEMPRE proponha agendar visita imediatamente.`
        }
    ];

    try {
        const botResponseText = await getAssistedResponse(contextualHistory);
        
        history.push({ role: "assistant", content: botResponseText });
        
        if (history.length > 20) {
            history.splice(0, history.length - 20);
        }
        
        // Salvar resposta do bot no banco
        await conversationService.saveMessage(
            conversa.id,
            botResponseText.replace(/\[PROPERTY_BLOCK\]/g, ''), // Remove marcadores
            'bot',
            { tipo: 'texto' }
        );

        // Verifica se a resposta contém marcador de imóveis divididos
        if (botResponseText.includes('[PROPERTY_BLOCK]')) {
            const blocks = botResponseText.split('[PROPERTY_BLOCK]').filter(b => b.trim());
            
            for (let i = 0; i < blocks.length; i++) {
                const block = blocks[i].trim();
                if (block) {
                    await sock.sendMessage(chatId, { text: block }, i === 0 ? { quoted: originalMessage } : {});
                    
                    const idMatch = block.match(/🆔 \*\*Código:\*\* (\w+)/);
                    if (idMatch) {
                        const propertyId = idMatch[1];
                        const allProperties = await searchProperties({});
                        const property = allProperties.find(p => p.id === propertyId);
                        
                        // Atualizar score e criar/atualizar negócio
                        await conversationService.updateContactScore(contato.id, 'property_viewed');
                        
                        if (property) {
                            await conversationService.updateDealFromConversation(
                                contato.id,
                                {
                                    tipo: property.type,
                                    valor: property.price
                                }
                            );

                            // Enviar foto se disponível
                            if (property.coverPhoto || property.photos?.length > 0) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                                const photoUrl = property.coverPhoto || property.photos[0];
                                try {
                                    await sock.sendMessage(chatId, { 
                                        image: { url: photoUrl }
                                    });
                                } catch (photoError) {
                                    logger.error(`Erro ao enviar foto: ${photoError.message}`);
                                }
                            }
                        }
                    }
                    
                    if (i < blocks.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                }
            }
            
            const allIds = botResponseText.match(/🆔 \*\*Código:\*\* (\w+)/g)?.map(match => match.replace(/🆔 \*\*Código:\*\* /, ''));
            if (allIds && allIds.length > 0) {
                followUpManager.addToFollowUp(chatId, allIds);
            }
            
        } else {
            await sock.sendMessage(chatId, { text: botResponseText }, { quoted: originalMessage });
        }
        
        // Atualiza estado da conversa
        const propertyIds = botResponseText.match(/🆔 \*\*Código:\*\* (\w+)/g)?.map(match => match.replace(/🆔 \*\*Código:\*\* /, ''));
        updateConversationState(chatId, botResponseText, propertyIds, conversationStates, contato, conversationService);

    } catch (error) {
        logger.error(`Erro ao obter resposta da IA: ${error}`);
        await sock.sendMessage(chatId, { 
            text: `❌ Ops, tive um probleminha técnico. Pode repetir?` 
        }, { quoted: originalMessage });
    }
}

async function updateConversationState(chatId, responseText, propertyIds, statesMap, contato, conversationService) {
    const currentState = statesMap.get(chatId) || { stage: 'initial' };
    
    if (responseText.includes("para morar ou investir")) {
        statesMap.set(chatId, { stage: 'qualifying', step: 'purpose' });
    } else if (responseText.includes("casa ou apartamento")) {
        statesMap.set(chatId, { stage: 'qualifying', step: 'type' });
    } else if (responseText.includes("Em qual cidade")) {
        statesMap.set(chatId, { stage: 'qualifying', step: 'city' });
    } else if (responseText.includes("quantos quartos")) {
        statesMap.set(chatId, { stage: 'qualifying', step: 'bedrooms' });
    } else if (responseText.includes("agendada para")) {
        statesMap.set(chatId, { stage: 'scheduled' });
        // Atualizar score significativamente quando agenda visita
        await conversationService.updateContactScore(contato.id, 'visit_scheduled');
        
        // Buscar negócio e avançar etapa
        const negocios = await conversationService.Negocio.findAll({
            where: { contato_id: contato.id, ganho: null }
        });
        
        if (negocios.length > 0) {
            await conversationService.advanceDealStage(negocios[0].id);
        }
    } else if (responseText.includes("Vamos agendar")) {
        statesMap.set(chatId, { stage: 'scheduling' });
        await conversationService.updateContactScore(contato.id, 'schedule_requested');
    } else if (propertyIds && propertyIds.length > 0) {
        statesMap.set(chatId, { stage: 'presented_properties', interactionCount: (currentState.interactionCount || 0) + 1 });
    }
    
    logger.info(`Estado da conversa ${chatId} atualizado para: ${JSON.stringify(statesMap.get(chatId))}`);
}

function startCleanupSchedule() {
    setInterval(() => {
        const now = Date.now();
        const sixHours = 6 * 60 * 60 * 1000;
        
        for (const [chatId, lastTime] of lastMessageTime.entries()) {
            if (now - lastTime > sixHours) {
                conversationHistories.delete(chatId);
                conversationStates.delete(chatId);
                lastMessageTime.delete(chatId);
                logger.info(`Conversa ${chatId} removida por inatividade`);
            }
        }
    }, 60 * 60 * 1000);
}

logger.info("Iniciando o bot assistente imobiliário v3.0...");
logger.info("Integração com PostgreSQL ativada");

startCleanupSchedule();
connectToWhatsApp();