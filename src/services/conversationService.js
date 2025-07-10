// backend/src/services/conversationService.js
const { Contato, Conversa, Mensagem, Negocio, PipelineEtapa } = require('../models');
const logger = require('../utils/logger');

class ConversationService {
  constructor(empresaId = null) {
    // Por enquanto vamos usar uma empresa padrão
    // Em produção, isso viria da autenticação
    this.empresaId = empresaId || process.env.DEFAULT_EMPRESA_ID || '00000000-0000-0000-0000-000000000001';
  }

  /**
   * Encontra ou cria um contato baseado no WhatsApp ID
   */
  async findOrCreateContact(whatsappId, nome = null) {
    try {
      // Remove o @s.whatsapp.net se existir
      const cleanWhatsapp = whatsappId.replace('@s.whatsapp.net', '');
      
      let contato = await Contato.findOne({
        where: {
          whatsapp: cleanWhatsapp,
          empresa_id: this.empresaId
        }
      });

      if (!contato) {
        contato = await Contato.create({
          empresa_id: this.empresaId,
          nome: nome || `Cliente ${cleanWhatsapp}`,
          whatsapp: cleanWhatsapp,
          telefone: cleanWhatsapp,
          origem: 'whatsapp',
          score: 50
        });

        logger.info(`Novo contato criado: ${contato.id}`);
      }

      return contato;
    } catch (error) {
      logger.error('Erro ao criar/buscar contato:', error);
      throw error;
    }
  }

  /**
   * Encontra ou cria uma conversa
   */
  async findOrCreateConversation(contatoId, canalId = null) {
    try {
      let conversa = await Conversa.findOne({
        where: {
          contato_id: contatoId,
          empresa_id: this.empresaId,
          status: 'aberta'
        }
      });

      if (!conversa) {
        conversa = await Conversa.create({
          empresa_id: this.empresaId,
          contato_id: contatoId,
          canal_id: canalId,
          canal_tipo: 'whatsapp',
          status: 'aberta',
          bot_ativo: true,
          primeira_mensagem_em: new Date()
        });

        logger.info(`Nova conversa criada: ${conversa.id}`);
      }

      // Atualiza última mensagem
      await conversa.update({
        ultima_mensagem_em: new Date()
      });

      return conversa;
    } catch (error) {
      logger.error('Erro ao criar/buscar conversa:', error);
      throw error;
    }
  }

  /**
   * Salva uma mensagem no banco
   */
  async saveMessage(conversaId, conteudo, remetenteTipo, metadata = {}) {
    try {
      const mensagem = await Mensagem.create({
        conversa_id: conversaId,
        remetente_tipo: remetenteTipo, // 'contato', 'bot', 'usuario'
        conteudo: conteudo,
        tipo_conteudo: metadata.tipo || 'texto',
        metadata: metadata,
        transcricao: metadata.transcricao || null
      });

      logger.info(`Mensagem salva: ${mensagem.id}`);
      return mensagem;
    } catch (error) {
      logger.error('Erro ao salvar mensagem:', error);
      throw error;
    }
  }

  /**
   * Cria ou atualiza um negócio baseado na conversa
   */
  async updateDealFromConversation(contatoId, propertyInfo = null) {
    try {
      // Busca se já existe um negócio aberto para este contato
      let negocio = await Negocio.findOne({
        where: {
          contato_id: contatoId,
          empresa_id: this.empresaId,
          ganho: null // Ainda não foi fechado
        }
      });

      // Busca a primeira etapa do pipeline
      const primeiraEtapa = await PipelineEtapa.findOne({
        where: {
          empresa_id: this.empresaId,
          ordem: 1
        }
      });

      if (!negocio && propertyInfo) {
        // Cria novo negócio
        negocio = await Negocio.create({
          empresa_id: this.empresaId,
          contato_id: contatoId,
          etapa_id: primeiraEtapa?.id,
          titulo: `Interesse em ${propertyInfo.tipo || 'Imóvel'}`,
          valor: propertyInfo.valor || 0,
          origem: 'whatsapp',
          probabilidade: 25
        });

        logger.info(`Novo negócio criado: ${negocio.id}`);
      } else if (negocio && propertyInfo) {
        // Atualiza valor se for maior
        if (propertyInfo.valor > negocio.valor) {
          await negocio.update({
            valor: propertyInfo.valor
          });
        }
      }

      return negocio;
    } catch (error) {
      logger.error('Erro ao criar/atualizar negócio:', error);
      throw error;
    }
  }

  /**
   * Move negócio para próxima etapa
   */
  async advanceDealStage(negocioId) {
    try {
      const negocio = await Negocio.findByPk(negocioId, {
        include: [PipelineEtapa]
      });

      if (!negocio) return null;

      // Busca próxima etapa
      const proximaEtapa = await PipelineEtapa.findOne({
        where: {
          empresa_id: this.empresaId,
          ordem: negocio.PipelineEtapa.ordem + 1,
          tipo: 'normal'
        }
      });

      if (proximaEtapa) {
        await negocio.update({
          etapa_id: proximaEtapa.id,
          probabilidade: Math.min(negocio.probabilidade + 25, 100)
        });

        logger.info(`Negócio ${negocioId} movido para etapa ${proximaEtapa.nome}`);
      }

      return negocio;
    } catch (error) {
      logger.error('Erro ao avançar etapa do negócio:', error);
      throw error;
    }
  }

  /**
   * Busca histórico de conversas
   */
  async getConversationHistory(contatoId, limit = 50) {
    try {
      const conversas = await Conversa.findAll({
        where: {
          contato_id: contatoId,
          empresa_id: this.empresaId
        },
        include: [{
          model: Mensagem,
          limit: limit,
          order: [['criado_em', 'DESC']]
        }],
        order: [['criado_em', 'DESC']]
      });

      return conversas;
    } catch (error) {
      logger.error('Erro ao buscar histórico:', error);
      throw error;
    }
  }

  /**
   * Atualiza score do contato baseado em interações
   */
  async updateContactScore(contatoId, interactionType) {
    try {
      const contato = await Contato.findByPk(contatoId);
      if (!contato) return;

      let scoreChange = 0;
      switch (interactionType) {
        case 'message_sent': scoreChange = 2; break;
        case 'property_viewed': scoreChange = 5; break;
        case 'schedule_requested': scoreChange = 15; break;
        case 'visit_scheduled': scoreChange = 20; break;
        default: scoreChange = 1;
      }

      const newScore = Math.min(contato.score + scoreChange, 100);
      await contato.update({ score: newScore });

      logger.info(`Score do contato ${contatoId} atualizado para ${newScore}`);
    } catch (error) {
      logger.error('Erro ao atualizar score:', error);
    }
  }
}

module.exports = ConversationService;