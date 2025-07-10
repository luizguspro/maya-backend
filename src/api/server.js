// backend/src/api/server.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const logger = require('../utils/logger');
const pipelineAutomation = require('../services/pipelineAutomation');
const initDatabase = require('../database/init');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173", // URL do frontend Vite
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Middlewares
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware para adicionar io ao req
app.use((req, res, next) => {
  req.io = io;
  req.empresaId = process.env.DEFAULT_EMPRESA_ID || '00000000-0000-0000-0000-000000000001';
  next();
});

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date(),
    database: 'connected',
    automation: pipelineAutomation.isRunning ? 'running' : 'stopped'
  });
});

// Importar e usar rotas
try {
  const authRoutes = require('./routes/auth');
  const dashboardRoutes = require('./routes/dashboard');
  const conversationsRoutes = require('./routes/conversations');
  const pipelineRoutes = require('./routes/pipeline');
  const contactsRoutes = require('./routes/contacts');
  const automationRoutes = require('./routes/automation');

  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/conversations', conversationsRoutes);
  app.use('/api/pipeline', pipelineRoutes);
  app.use('/api/contacts', contactsRoutes);
  app.use('/api/automation', automationRoutes);
} catch (error) {
  logger.warn('Algumas rotas não foram carregadas:', error.message);
}

// Rota de fallback
app.get('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

// Socket.io para atualizações em tempo real
io.on('connection', (socket) => {
  logger.info(`Cliente conectado: ${socket.id}`);
  
  socket.on('join-company', (empresaId) => {
    socket.join(`empresa-${empresaId}`);
    logger.info(`Socket ${socket.id} entrou na sala empresa-${empresaId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Cliente desconectado: ${socket.id}`);
  });
});

// Função para emitir eventos
const emitToCompany = (empresaId, event, data) => {
  io.to(`empresa-${empresaId}`).emit(event, data);
};

// Exportar para uso em outros módulos
app.emitToCompany = emitToCompany;

const PORT = process.env.API_PORT || 3001;

// Função principal de inicialização
const startServer = async () => {
  try {
    // Inicializar banco de dados
    await initDatabase();
    
    // Iniciar servidor
    server.listen(PORT, () => {
      logger.info(`🚀 API Server rodando na porta ${PORT}`);
      logger.info(`📍 Endpoints disponíveis:`);
      logger.info(`   - GET  /api/health`);
      logger.info(`   - GET  /api/dashboard/kpis`);
      logger.info(`   - GET  /api/dashboard/recent-activities`);
      logger.info(`   - GET  /api/dashboard/performance-data`);
      logger.info(`   - GET  /api/dashboard/channel-performance`);
      logger.info(`   - GET  /api/conversations`);
      logger.info(`   - GET  /api/pipeline/stages`);
      logger.info(`   - GET  /api/pipeline/deals`);
      logger.info(`   - POST /api/pipeline/deals`);
      logger.info(`   - PUT  /api/pipeline/deals/:id/move`);
      logger.info(`   - GET  /api/automation/status`);
      logger.info(`   - POST /api/automation/start`);
      logger.info(`   - POST /api/automation/stop`);
      logger.info(`   - POST /api/automation/run-now`);
      
      // Iniciar serviço de automação
      logger.info(`🤖 Iniciando serviço de automação do pipeline...`);
      pipelineAutomation.start();
    });
  } catch (error) {
    logger.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
};

// Iniciar servidor
startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido, fechando servidor...');
  
  // Parar automação
  pipelineAutomation.stop();
  
  server.close(() => {
    logger.info('Servidor fechado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT recebido, fechando servidor...');
  
  // Parar automação
  pipelineAutomation.stop();
  
  server.close(() => {
    logger.info('Servidor fechado');
    process.exit(0);
  });
});