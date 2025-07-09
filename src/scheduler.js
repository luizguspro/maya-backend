// src/scheduler.js
const logger = require('./utils/logger');

async function scheduleVisit(propertyId, date, time, customerName, isPhoneCall = false) {
    const visitType = isPhoneCall ? 'ligação' : 'visita';
    
    // Se não tiver data/hora definida, retorna sugestões
    if (!date || !time || date === 'undefined' || time === 'undefined') {
        return {
            success: false,
            needsSuggestions: true,
            message: `Entendo que você precisa verificar sua agenda! 📅 Que tal algumas opções?\n\n` +
                    `🗓️ *Esta semana:*\n` +
                    `• Quinta-feira (09/07) - Manhã: 9h, 10h ou 11h\n` +
                    `• Quinta-feira (09/07) - Tarde: 14h, 15h ou 16h\n` +
                    `• Sexta-feira (10/07) - Manhã: 9h, 10h ou 11h\n\n` +
                    `🗓️ *Próxima semana:*\n` +
                    `• Segunda a sexta - Horários flexíveis das 9h às 18h\n\n` +
                    `Ou se preferir, me diga qual o melhor dia e horário para você! 😊`
        };
    }

    // Validação de data futura
    const visitDate = new Date(`${date}T${time}`);
    const now = new Date();
    
    if (visitDate <= now) {
        return {
            success: false,
            message: `Ops! Precisamos de uma data futura. Que tal amanhã ou outro dia desta semana? 📅`
        };
    }

    // Validação de horário comercial (9h às 18h) - mas mais flexível para ligações
    const hour = parseInt(time.split(':')[0]);
    if (!isPhoneCall && (hour < 9 || hour > 18)) {
        return {
            success: false,
            message: `Para visitas presenciais, nosso horário é das 9h às 18h. Mas posso agendar uma ligação em horário mais flexível! O que prefere?`
        };
    }

    // Para ligações, aceita horários mais flexíveis
    if (isPhoneCall && (hour < 8 || hour > 20)) {
        return {
            success: false,
            message: `Para ligações, podemos conversar entre 8h e 20h. Qual horário nesse período fica melhor?`
        };
    }

    const confirmation = {
        success: true,
        message: isPhoneCall ? 
            `🎉 Perfeito, ${customerName}! Nossa ligação está agendada para ${formatDate(date)} às ${time}. ` +
            `Vou te ligar no número que você está usando aqui no WhatsApp. ` +
            `Prepare suas dúvidas que vou adorar ajudar você a encontrar o imóvel ideal! 📞✨` :
            `🎉 Maravilha, ${customerName}! Sua visita ao imóvel ${propertyId} está confirmada para ${formatDate(date)} às ${time}. ` +
            `Vou enviar a localização exata aqui no WhatsApp 24h antes. ` +
            `Prepare-se para se apaixonar pelo seu futuro lar! 🏠✨`,
        details: {
            propertyId: isPhoneCall ? 'LIGACAO' : propertyId,
            date,
            time,
            customerName,
            type: visitType
        }
    };

    logger.info(`AGENDAMENTO CONFIRMADO: ${JSON.stringify(confirmation.details)}`);

    return confirmation;
}

function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

module.exports = { scheduleVisit };