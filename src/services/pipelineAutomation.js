// backend/src/services/pipelineAutomation.js
const { Op } = require('sequelize');
const { sequelize } = require('../database');
const { 
  Contato, 
  Negocio, 
  PipelineEtapa,
  Conversa,
  Mensagem,
  AutomacaoFluxo,
  AutomacaoExecucao
} = require('../models');
const logger = require('../utils/logger');

class PipelineAutomationService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
  }

  // Iniciar automação
  start() {
    if (this.isRunning) {
      logger.warn('Automação já está em execução');
      return;
    }

    this.isRunning = true;
    logger.info('🤖 Iniciando serviço de automação do pipeline');

    // Executar a cada 5 minutos
    this.intervalId = setInterval(() => {
      this.runAutomations();
    }, 5 * 60 * 1000); // 5 minutos

    // Executar imediatamente na primeira vez
    this.runAutomations();
  }

  // Parar automação
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('🛑 Serviço de automação parado');
  }

  // Executar todas as automações
  async runAutomations() {
    try {
      logger.info('⚡ Executando automações do pipeline...');

      // Buscar todas as empresas ativas
      const empresas = await sequelize.query(
        'SELECT DISTINCT empresa_id FROM "maya-crm".negocios WHERE ganho IS NULL',
        { type: sequelize.QueryTypes.SELECT }
      );

      for (const { empresa_id } of empresas) {
        await this.processEmpresa(empresa_id);
      }

      logger.info('✅ Automações concluídas');
    } catch (error) {
      logger.error('❌ Erro ao executar automações:', error);
    }
  }

  // Processar automações de uma empresa
  async processEmpresa(empresaId) {
    const transaction = await sequelize.transaction();

    try {
      // 1. Automação: Cliente Quente → Em Negociação
      await this.moverClientesQuentes(empresaId, transaction);

      // 2. Automação: Cadência de Contato (não respondeu)
      await this.aplicarCadenciaContato(empresaId, transaction);

      // 3. Automação: Qualificação por Score
      await this.qualificarPorScore(empresaId, transaction);

      // 4. Automação: Mover para Perdido (sem resposta há muito tempo)
      await this.moverParaPerdido(empresaId, transaction);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      logger.error(`Erro ao processar empresa ${empresaId}:`, error);
    }
  }

  // 1. Mover clientes quentes pré-qualificados para "Em Negociação"
  async moverClientesQuentes(empresaId, transaction) {
    try {
      // Buscar etapas
      const etapaQualificado = await PipelineEtapa.findOne({
        where: {
          empresa_id: empresaId,
          nome: { [Op.iLike]: '%qualificad%' }
        },
        transaction
      });

      const etapaNegociacao = await PipelineEtapa.findOne({
        where: {
          empresa_id: empresaId,
          nome: { [Op.iLike]: '%negociaç%' }
        },
        transaction
      });

      if (!etapaQualificado || !etapaNegociacao) return;

      // Buscar negócios qualificados com score alto
      const negociosQuentes = await Negocio.findAll({
        where: {
          empresa_id: empresaId,
          etapa_id: etapaQualificado.id,
          ganho: null,
          probabilidade: { [Op.gte]: 70 }
        },
        include: [{
          model: Contato,
          where: {
            score: { [Op.gte]: 80 } // Score alto indica cliente quente
          }
        }],
        transaction
      });

      for (const negocio of negociosQuentes) {
        // Verificar se teve interação recente (últimas 48h)
        const interacaoRecente = await Conversa.findOne({
          where: {
            contato_id: negocio.contato_id,
            ultima_mensagem_em: {
              [Op.gte]: new Date(Date.now() - 48 * 60 * 60 * 1000)
            }
          },
          transaction
        });

        if (interacaoRecente) {
          // Mover para negociação
          await negocio.update({
            etapa_id: etapaNegociacao.id,
            probabilidade: 85
          }, { transaction });

          // Registrar movimentação
          await this.registrarMovimentacao(
            negocio.id,
            etapaQualificado.id,
            etapaNegociacao.id,
            'Movido automaticamente - Cliente quente com interação recente',
            transaction
          );

          logger.info(`✅ Negócio ${negocio.id} movido para Negociação (cliente quente)`);
        }
      }
    } catch (error) {
      logger.error('Erro ao mover clientes quentes:', error);
    }
  }

  // 2. Aplicar cadência de contato para não responderam
  async aplicarCadenciaContato(empresaId, transaction) {
    try {
      const etapaNovosLeads = await PipelineEtapa.findOne({
        where: {
          empresa_id: empresaId,
          ordem: 1 // Primeira etapa
        },
        transaction
      });

      let etapaCadencia = await PipelineEtapa.findOne({
        where: {
          empresa_id: empresaId,
          nome: { [Op.iLike]: '%cadência%' }
        },
        transaction
      });

      // Se não tiver etapa de cadência, criar uma
      if (!etapaCadencia && etapaNovosLeads) {
        // Buscar próxima ordem disponível
        const maxOrdem = await PipelineEtapa.max('ordem', {
          where: { empresa_id: empresaId },
          transaction
        });
        
        etapaCadencia = await PipelineEtapa.create({
          empresa_id: empresaId,
          nome: 'Cadência de Contato',
          descricao: 'Leads que não responderam e precisam de follow-up',
          cor: '#FFA500',
          ordem: (maxOrdem || 0) + 1,
          tipo: 'normal'
        }, { transaction });
      }

      if (!etapaNovosLeads || !etapaCadencia) return;

      // Buscar negócios sem resposta há mais de 72h
      const negociosSemResposta = await Negocio.findAll({
        where: {
          empresa_id: empresaId,
          etapa_id: etapaNovosLeads.id,
          ganho: null,
          criado_em: {
            [Op.lte]: new Date(Date.now() - 72 * 60 * 60 * 1000) // 72 horas
          }
        },
        transaction
      });

      for (const negocio of negociosSemResposta) {
        // Verificar última interação
        const ultimaInteracao = await Conversa.findOne({
          where: { contato_id: negocio.contato_id },
          order: [['ultima_mensagem_em', 'DESC']],
          transaction
        });

        // Se não teve interação ou foi há mais de 72h
        if (!ultimaInteracao || 
            ultimaInteracao.ultima_mensagem_em < new Date(Date.now() - 72 * 60 * 60 * 1000)) {
          
          // Mover para cadência
          await negocio.update({
            etapa_id: etapaCadencia.id,
            probabilidade: Math.max(negocio.probabilidade - 10, 10) // Reduz probabilidade
          }, { transaction });

          // Criar tarefa de follow-up
          await this.criarTarefaFollowUp(negocio, transaction);

          // Registrar movimentação
          await this.registrarMovimentacao(
            negocio.id,
            etapaNovosLeads.id,
            etapaCadencia.id,
            'Movido para cadência - Sem resposta há 72h',
            transaction
          );

          logger.info(`📧 Negócio ${negocio.id} movido para Cadência de Contato`);
        }
      }
    } catch (error) {
      logger.error('Erro ao aplicar cadência:', error);
    }
  }

  // 3. Qualificar automaticamente por score
  async qualificarPorScore(empresaId, transaction) {
    try {
      const etapaNovos = await PipelineEtapa.findOne({
        where: {
          empresa_id: empresaId,
          ordem: 1
        },
        transaction
      });

      const etapaQualificado = await PipelineEtapa.findOne({
        where: {
          empresa_id: empresaId,
          nome: { [Op.iLike]: '%qualificad%' }
        },
        transaction
      });

      if (!etapaNovos || !etapaQualificado) return;

      // Buscar negócios novos com contatos de score alto
      const negociosParaQualificar = await Negocio.findAll({
        where: {
          empresa_id: empresaId,
          etapa_id: etapaNovos.id,
          ganho: null
        },
        include: [{
          model: Contato,
          where: {
            score: { [Op.gte]: 70 }
          }
        }],
        transaction
      });

      for (const negocio of negociosParaQualificar) {
        // Verificar se teve alguma interação
        const temInteracao = await Conversa.count({
          where: { contato_id: negocio.contato_id },
          transaction
        });

        if (temInteracao > 0) {
          await negocio.update({
            etapa_id: etapaQualificado.id,
            probabilidade: Math.min(negocio.probabilidade + 25, 75)
          }, { transaction });

          await this.registrarMovimentacao(
            negocio.id,
            etapaNovos.id,
            etapaQualificado.id,
            `Qualificado automaticamente - Score: ${negocio.Contato.score}`,
            transaction
          );

          logger.info(`⭐ Negócio ${negocio.id} qualificado (score: ${negocio.Contato.score})`);
        }
      }
    } catch (error) {
      logger.error('Erro ao qualificar por score:', error);
    }
  }

  // 4. Mover para perdido após longo período sem resposta
  async moverParaPerdido(empresaId, transaction) {
    try {
      const etapaPerdido = await PipelineEtapa.findOne({
        where: {
          empresa_id: empresaId,
          tipo: 'perdido'
        },
        transaction
      });

      if (!etapaPerdido) return;

      // Buscar negócios sem interação há mais de 30 dias
      const dataLimite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const negociosAbandonados = await sequelize.query(`
        SELECT DISTINCT n.*
        FROM "maya-crm".negocios n
        LEFT JOIN "maya-crm".conversas c ON c.contato_id = n.contato_id
        WHERE n.empresa_id = :empresaId
          AND n.ganho IS NULL
          AND n.etapa_id != :etapaPerdidoId
          AND (
            c.ultima_mensagem_em IS NULL 
            OR c.ultima_mensagem_em < :dataLimite
          )
          AND n.criado_em < :dataLimite
      `, {
        replacements: {
          empresaId,
          etapaPerdidoId: etapaPerdido.id,
          dataLimite
        },
        type: sequelize.QueryTypes.SELECT,
        transaction
      });

      for (const negocioData of negociosAbandonados) {
        const negocio = await Negocio.findByPk(negocioData.id, { transaction });
        
        await negocio.update({
          etapa_id: etapaPerdido.id,
          ganho: false,
          fechado_em: new Date(),
          motivo_perda: 'Sem resposta - Abandonado após 30 dias',
          probabilidade: 0
        }, { transaction });

        await this.registrarMovimentacao(
          negocio.id,
          negocio.etapa_id,
          etapaPerdido.id,
          'Perdido automaticamente - Sem resposta há 30 dias',
          transaction
        );

        logger.info(`❌ Negócio ${negocio.id} marcado como perdido (abandonado)`);
      }
    } catch (error) {
      logger.error('Erro ao mover para perdido:', error);
    }
  }

  // Criar tarefa de follow-up
  async criarTarefaFollowUp(negocio, transaction) {
    try {
      const Tarefa = sequelize.models.Tarefa;
      
      if (Tarefa) {
        await Tarefa.create({
          empresa_id: negocio.empresa_id,
          titulo: `Follow-up: ${negocio.titulo || 'Negócio'} - Sem resposta`,
          descricao: 'Cliente não respondeu. Realizar novo contato.',
          tipo: 'ligacao',
          prioridade: 'alta',
          status: 'pendente',
          data_vencimento: new Date(Date.now() + 24 * 60 * 60 * 1000), // Amanhã
          contato_id: negocio.contato_id,
          negocio_id: negocio.id
        }, { transaction });
      }
    } catch (error) {
      logger.error('Erro ao criar tarefa:', error);
    }
  }

  // Registrar movimentação no histórico
  async registrarMovimentacao(negocioId, etapaAnteriorId, etapaNovaId, comentario, transaction) {
    try {
      const NegocioHistorico = sequelize.models.NegocioHistorico;
      
      if (NegocioHistorico) {
        await NegocioHistorico.create({
          negocio_id: negocioId,
          etapa_anterior_id: etapaAnteriorId,
          etapa_nova_id: etapaNovaId,
          comentario,
          usuario_id: null // Sistema
        }, { transaction });
      }

      // Registrar execução da automação
      const AutomacaoExecucao = sequelize.models.AutomacaoExecucao;
      if (AutomacaoExecucao) {
        await AutomacaoExecucao.create({
          fluxo_id: null, // Automação interna
          entidade_tipo: 'negocio',
          entidade_id: negocioId,
          status: 'sucesso',
          log: {
            acao: 'mover_etapa',
            de: etapaAnteriorId,
            para: etapaNovaId,
            motivo: comentario
          }
        }, { transaction });
      }
    } catch (error) {
      logger.error('Erro ao registrar movimentação:', error);
    }
  }
}

// Criar instância única
const pipelineAutomation = new PipelineAutomationService();

module.exports = pipelineAutomation;