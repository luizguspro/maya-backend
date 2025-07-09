// src/scheduler.js
const logger = require('./utils/logger');

/**
 * Simula o agendamento de uma visita.
 * No futuro, isso pode ser integrado com Google Calendar, etc.
 * @param {string} propertyId - O ID do imóvel a ser visitado.
 * @param {string} date - A data desejada para a visita (ex: "2025-07-10").
 * @param {string} time - O horário desejado para a visita (ex: "15:30").
 * @param {string} customerName - O nome do cliente.
 * @returns {object} - Um objeto confirmando o agendamento.
 */
async function scheduleVisit(propertyId, date, time, customerName) {
    const confirmation = {
        success: true,
        message: `Visita para o imóvel ${propertyId} agendada com sucesso para ${customerName} no dia ${date} às ${time}. Um corretor entrará em contato para confirmar.`,
        details: {
            propertyId,
            date,
            time,
            customerName,
        }
    };

    // No mundo real, aqui você faria a chamada para a API do Google Calendar, etc.
    logger.info(`AGENDAMENTO SIMULADO: ${JSON.stringify(confirmation.details)}`);

    return confirmation;
}

module.exports = { scheduleVisit };