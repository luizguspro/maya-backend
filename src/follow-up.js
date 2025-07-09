// src/follow-up.js
const cron = require('node-cron');
const logger = require('./utils/logger');

class FollowUpManager {
    constructor(sock) {
        this.sock = sock;
        this.followUps = new Map(); // chatId -> { lastContact, stage, propertyInterest }
    }

    addToFollowUp(chatId, propertyIds) {
        this.followUps.set(chatId, {
            lastContact: new Date(),
            stage: 0,
            propertyInterest: propertyIds,
            name: null // Será preenchido quando soubermos
        });
    }

    startFollowUpScheduler() {
        // Roda a cada hora para verificar follow-ups pendentes
        cron.schedule('0 * * * *', () => {
            this.checkPendingFollowUps();
        });
    }

    async checkPendingFollowUps() {
        const now = new Date();
        
        for (const [chatId, data] of this.followUps.entries()) {
            const daysSinceContact = Math.floor((now - data.lastContact) / (1000 * 60 * 60 * 24));
            
            // Follow-up em: 1, 3, 7 e 14 dias
            const followUpDays = [1, 3, 7, 14];
            
            if (followUpDays.includes(daysSinceContact) && data.stage < followUpDays.indexOf(daysSinceContact) + 1) {
                await this.sendFollowUp(chatId, data, daysSinceContact);
                data.stage++;
                data.lastContact = now;
            }
            
            // Remove após 14 dias
            if (daysSinceContact > 14) {
                this.followUps.delete(chatId);
            }
        }
    }

    async sendFollowUp(chatId, data, daysSince) {
        const messages = {
            1: `Oi! 👋 Ontem você demonstrou interesse em alguns imóveis. Conseguiu pensar melhor sobre qual mais combina com você? Posso agendar uma visita ainda esta semana!`,
            3: `Olá! 😊 Passando para saber se você teve a chance de conversar com a família sobre os imóveis que vimos. Aquele ${data.propertyInterest?.[0] || 'que você gostou'} continua disponível, mas tem bastante procura!`,
            7: `Oi! Tudo bem? 🏠 Faz uma semana que conversamos sobre sua busca por imóvel. Surgiram algumas novidades que podem te interessar! Quer que eu te mostre?`,
            14: `Olá! ✨ Última mensagem, prometo! Só queria te avisar que tivemos uma redução de preço em alguns imóveis. Vale a pena dar uma olhada! Me avisa se ainda tiver interesse.`
        };

        try {
            await this.sock.sendMessage(chatId, { text: messages[daysSince] });
            logger.info(`Follow-up enviado para ${chatId} - Dia ${daysSince}`);
        } catch (error) {
            logger.error(`Erro ao enviar follow-up: ${error}`);
        }
    }
}

module.exports = FollowUpManager;