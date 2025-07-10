// backend/src/index.js
require('dotenv').config();
const logger = require('./utils/logger');
const initDatabase = require('./scripts/initDatabase');
const { testConnection } = require('./database');

async function startApplication() {
  try {
    logger.info('=================================');
    logger.info('    Maya CRM - Iniciando...      ');
    logger.info('=================================');

    // Testar conexão com banco
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Falha na conexão com o banco de dados');
    }

    // Inicializar dados padrão
    await initDatabase();

    // Iniciar bot e API em processos separados
    if (process.env.RUN_MODE === 'bot') {
      logger.info('Iniciando em modo BOT...');
      require('./baileys-bot');
    } else if (process.env.RUN_MODE === 'api') {
      logger.info('Iniciando em modo API...');
      require('./api/server');
    } else {
      logger.info('Iniciando BOT e API...');
      // Por padrão, inicia ambos
      require('./baileys-bot');
      require('./api/server');
    }

  } catch (error) {
    logger.error('Erro fatal ao iniciar aplicação:', error);
    process.exit(1);
  }
}

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  logger.error('Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promessa rejeitada não tratada:', reason);
  process.exit(1);
});

// Tratamento de sinais de encerramento
process.on('SIGINT', () => {
  logger.info('Recebido SIGINT, encerrando graciosamente...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Recebido SIGTERM, encerrando graciosamente...');
  process.exit(0);
});

// Iniciar aplicação
startApplication();