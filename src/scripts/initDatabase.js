// backend/src/scripts/initDatabase.js
require('dotenv').config();
const { sequelize } = require('../database');
const { 
  Empresa, 
  PipelineEtapa,
  CanalIntegracao 
} = require('../models');
const logger = require('../utils/logger');

async function initDatabase() {
  try {
    logger.info('Iniciando setup do banco de dados...');

    // Criar empresa padrão se não existir
    const empresaId = process.env.DEFAULT_EMPRESA_ID || '00000000-0000-0000-0000-000000000001';
    
    let empresa = await Empresa.findByPk(empresaId);
    
    if (!empresa) {
      empresa = await Empresa.create({
        id: empresaId,
        nome: 'Maya CRM Demo',
        email: 'admin@mayacrm.com',
        telefone: '11999999999',
        plano: 'premium',
        ativo: true
      });
      logger.info('Empresa padrão criada');
    }

    // Criar etapas do pipeline se não existirem
    const etapasPadrao = [
      { nome: 'Novos Leads', descricao: 'Leads que acabaram de entrar', cor: '#3B82F6', ordem: 1, tipo: 'normal' },
      { nome: 'Qualificados', descricao: 'Leads com potencial confirmado', cor: '#8B5CF6', ordem: 2, tipo: 'normal' },
      { nome: 'Proposta', descricao: 'Proposta enviada', cor: '#F59E0B', ordem: 3, tipo: 'normal' },
      { nome: 'Negociação', descricao: 'Em negociação final', cor: '#F97316', ordem: 4, tipo: 'normal' },
      { nome: 'Ganhos', descricao: 'Negócios fechados', cor: '#10B981', ordem: 5, tipo: 'ganho' },
      { nome: 'Perdidos', descricao: 'Oportunidades perdidas', cor: '#EF4444', ordem: 6, tipo: 'perdido' }
    ];

    for (const etapa of etapasPadrao) {
      const existe = await PipelineEtapa.findOne({
        where: {
          empresa_id: empresaId,
          ordem: etapa.ordem
        }
      });

      if (!existe) {
        await PipelineEtapa.create({
          ...etapa,
          empresa_id: empresaId
        });
        logger.info(`Etapa "${etapa.nome}" criada`);
      }
    }

    // Criar canal WhatsApp padrão
    let canalWhatsApp = await CanalIntegracao.findOne({
      where: {
        empresa_id: empresaId,
        tipo: 'whatsapp'
      }
    });

    if (!canalWhatsApp) {
      canalWhatsApp = await CanalIntegracao.create({
        empresa_id: empresaId,
        tipo: 'whatsapp',
        nome: 'WhatsApp Principal',
        ativo: true,
        conectado: false
      });
      logger.info('Canal WhatsApp criado');
    }

    logger.info('✅ Banco de dados inicializado com sucesso!');

  } catch (error) {
    logger.error('Erro ao inicializar banco:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  initDatabase().then(() => {
    process.exit(0);
  });
}

module.exports = initDatabase;