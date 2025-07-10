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

// Importar database e serviço de conversas - USANDO A MESMA CONFIGURAÇÃO
const { sequelize, testConnection } = require('./database');
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
    try {
        // Primeiro testa conexão com o banco
        logger.info('🔌 Testando conexão com banco de dados...');
        await testConnection();
        logger.info('✅ Bot conectado ao banco de dados');
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        const sock = makeWASocket({ 
            auth: state, 
            printQRInTerminal: false, // Desabilitado por causa do warning
            logger: pino({ level: 'silent' }) 
        });

        // Inicializa o gerenciador de follow-up
        const followUpManager = new FollowUpManager(sock);
        followUpManager.startFollowUpScheduler();

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                logger.info('📱 QR Code gerado - escaneie com seu WhatsApp:');
                qrcode.generate(qr, { small: true });
            }
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                logger.warn(`❌ Conexão fechada: ${lastDisconnect?.error?.message || 'Erro desconhecido'}`);
                if (shouldReconnect) {
                    logger.info('🔄 Tentando reconectar...');
                    connectToWhatsApp();
                }
            } else if (connection === 'open') {
                logger.info('✅ Conexão WhatsApp estabelecida!');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            const messageTimestamp = typeof msg.messageTimestamp === 'number' ? 
                msg.messageTimestamp : parseInt(msg.messageTimestamp || '0');
                
            if (!msg.key.fromMe && msg.message && messageTimestamp > botStartTime) {
                const textMessage = msg.message.conversation || 
                                  msg.message.extendedTextMessage?.text;
                const audioMessage = msg.message.audioMessage;
                const chatId = msg.key.remoteJid;

                lastMessageTime.set(chatId, Date.now());

                const now = new Date();
                const hour = now.getHours();
                
                if (hour >= 22 || hour < 8) {
                    await sock.sendMessage(chatId, { 
                        text: "🌙 Nosso horário de atendimento é das 8h às 22h. " +
                              "Retornaremos assim que possível! 😊" 
                    });
                    return;
                }

                if (!textMessage && !audioMessage) {
                    await sock.sendMessage(chatId, { 
                        text: "Olá! 👋 Sou Léo, corretor virtual da SC Imóveis. " +
                              "Por favor, envie mensagens de texto ou áudio. " +
                              "Como posso ajudar você a encontrar o imóvel dos seus sonhos?" 
                    });
                    return;
                }

                if (processingJobs.get(chatId)) {
                    await sock.sendMessage(chatId, { 
                        text: 'Um momento, estou finalizando sua última solicitação... 🏃‍♂️' 
                    });
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
            }
        });

    } catch (error) {
        logger.error('❌ Erro ao conectar WhatsApp:', error);
        logger.info('🔄 Tentando novamente em 5 segundos...');
        setTimeout(connectToWhatsApp, 5000);
    }
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
                    await sock.sendMessage(chatId, { text: block }, i === 0 ? 
                        { quoted: originalMessage } : undefined);
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
        } else {
            await sock.sendMessage(chatId, { text: botResponseText }, { quoted: originalMessage });
        }

        // Extrai IDs dos imóveis da resposta para follow-up
        const propertyIdMatches = botResponseText.match(/Código:\s*([A-Z]{2,3}\d{3})/g);
        const propertyIds = propertyIdMatches ? 
            propertyIdMatches.map(match => match.replace('Código:', '').trim()) : null;

        // Atualiza estado da conversa
        await updateConversationState(chatId, botResponseText, propertyIds, conversationStates, contato, conversationService);

        // Se mostrou imóveis, agendar follow-up
        if (propertyIds && propertyIds.length > 0) {
            followUpManager.scheduleFollowUp(chatId, propertyIds);
            
            // Atualizar score por ver imóveis
            await conversationService.updateContactScore(contato.id, 'property_viewed');
        }

    } catch (error) {
        logger.error(`Erro ao gerar resposta: ${error.message}`);
        await sock.sendMessage(chatId, { 
            text: `❌ Ops! Tive um problema ao processar sua mensagem. Pode repetir?` 
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