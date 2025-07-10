// backend/src/models/index.js
const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../database');

// Model Empresa
const Empresa = sequelize.define('Empresa', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nome: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  cnpj: DataTypes.STRING(20),
  telefone: DataTypes.STRING(20),
  email: DataTypes.STRING(255),
  endereco: DataTypes.TEXT,
  plano: {
    type: DataTypes.STRING(50),
    defaultValue: 'basico'
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'empresas',
  timestamps: true,
  createdAt: 'criado_em',
  updatedAt: 'atualizado_em'
});

// Model Usuario
const Usuario = sequelize.define('Usuario', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  empresa_id: {
    type: DataTypes.UUID,
    references: { model: 'empresas', key: 'id' }
  },
  nome: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  senha: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  telefone: DataTypes.STRING(20),
  cargo: DataTypes.STRING(100),
  ultimo_acesso: DataTypes.DATE,
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'usuarios',
  timestamps: true,
  createdAt: 'criado_em',
  updatedAt: 'atualizado_em'
});

// Model Contato
const Contato = sequelize.define('Contato', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  empresa_id: {
    type: DataTypes.UUID,
    references: { model: 'empresas', key: 'id' }
  },
  nome: DataTypes.STRING(255),
  email: DataTypes.STRING(255),
  telefone: DataTypes.STRING(20),
  whatsapp: DataTypes.STRING(20),
  cpf_cnpj: DataTypes.STRING(20),
  empresa: DataTypes.STRING(255),
  cargo: DataTypes.STRING(100),
  origem: DataTypes.STRING(50),
  score: {
    type: DataTypes.INTEGER,
    defaultValue: 50
  },
  campos_customizados: DataTypes.JSONB,
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'contatos',
  timestamps: true,
  createdAt: 'criado_em',
  updatedAt: 'atualizado_em'
});

// Model Canal Integração (simplificado)
const CanalIntegracao = sequelize.define('CanalIntegracao', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  empresa_id: {
    type: DataTypes.UUID,
    references: { model: 'empresas', key: 'id' }
  },
  tipo: DataTypes.STRING(50),
  nome: DataTypes.STRING(100),
  configuracao: DataTypes.JSONB,
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'canais_integracao',
  timestamps: true,
  createdAt: 'criado_em',
  updatedAt: 'atualizado_em'
});

// Model Conversa
const Conversa = sequelize.define('Conversa', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  empresa_id: {
    type: DataTypes.UUID,
    references: { model: 'empresas', key: 'id' }
  },
  contato_id: {
    type: DataTypes.UUID,
    references: { model: 'contatos', key: 'id' }
  },
  canal_id: DataTypes.UUID,
  canal_tipo: {
    type: DataTypes.STRING(50),
    defaultValue: 'whatsapp'
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'aberta'
  },
  prioridade: {
    type: DataTypes.STRING(20),
    defaultValue: 'normal'
  },
  atribuido_para: DataTypes.UUID,
  primeira_mensagem_em: DataTypes.DATE,
  ultima_mensagem_em: DataTypes.DATE,
  tempo_primeira_resposta: DataTypes.INTEGER,
  tempo_resolucao: DataTypes.INTEGER,
  bot_ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  arquivada: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'conversas',
  timestamps: true,
  createdAt: 'criado_em',
  updatedAt: 'atualizado_em'
});

// Model Mensagem
const Mensagem = sequelize.define('Mensagem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  conversa_id: {
    type: DataTypes.UUID,
    references: { model: 'conversas', key: 'id' },
    allowNull: false
  },
  remetente_tipo: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  remetente_id: DataTypes.UUID,
  conteudo: DataTypes.TEXT,
  tipo_conteudo: {
    type: DataTypes.STRING(50),
    defaultValue: 'texto'
  },
  metadata: DataTypes.JSONB,
  transcricao: DataTypes.TEXT,
  lida: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  enviada: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  erro_envio: DataTypes.TEXT
}, {
  tableName: 'mensagens',
  timestamps: true,
  createdAt: 'criado_em',
  updatedAt: false
});

// Model Pipeline Etapas
const PipelineEtapa = sequelize.define('PipelineEtapa', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  empresa_id: {
    type: DataTypes.UUID,
    references: { model: 'empresas', key: 'id' }
  },
  nome: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  descricao: DataTypes.TEXT,
  cor: {
    type: DataTypes.STRING(7),
    defaultValue: '#3B82F6'
  },
  ordem: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tipo: {
    type: DataTypes.STRING(20),
    defaultValue: 'normal'
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'pipeline_etapas',
  timestamps: true,
  createdAt: 'criado_em',
  updatedAt: false
});

// Model Negócio
const Negocio = sequelize.define('Negocio', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  empresa_id: {
    type: DataTypes.UUID,
    references: { model: 'empresas', key: 'id' }
  },
  contato_id: {
    type: DataTypes.UUID,
    references: { model: 'contatos', key: 'id' }
  },
  etapa_id: {
    type: DataTypes.UUID,
    references: { model: 'pipeline_etapas', key: 'id' }
  },
  titulo: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  valor: DataTypes.DECIMAL(15, 2),
  moeda: {
    type: DataTypes.STRING(3),
    defaultValue: 'BRL'
  },
  probabilidade: {
    type: DataTypes.INTEGER,
    defaultValue: 50,
    validate: { min: 0, max: 100 }
  },
  previsao_fechamento: DataTypes.DATE,
  responsavel_id: {
    type: DataTypes.UUID,
    references: { model: 'usuarios', key: 'id' }
  },
  origem: DataTypes.STRING(50),
  motivo_perda: DataTypes.TEXT,
  fechado_em: DataTypes.DATE,
  ganho: DataTypes.BOOLEAN
}, {
  tableName: 'negocios',
  timestamps: true,
  createdAt: 'criado_em',
  updatedAt: 'atualizado_em'
});

// Associações
Empresa.hasMany(Usuario, { foreignKey: 'empresa_id' });
Usuario.belongsTo(Empresa, { foreignKey: 'empresa_id' });

Empresa.hasMany(Contato, { foreignKey: 'empresa_id' });
Contato.belongsTo(Empresa, { foreignKey: 'empresa_id' });

Empresa.hasMany(Conversa, { foreignKey: 'empresa_id' });
Conversa.belongsTo(Empresa, { foreignKey: 'empresa_id' });

Contato.hasMany(Conversa, { foreignKey: 'contato_id' });
Conversa.belongsTo(Contato, { foreignKey: 'contato_id' });

Conversa.hasMany(Mensagem, { foreignKey: 'conversa_id' });
Mensagem.belongsTo(Conversa, { foreignKey: 'conversa_id' });

Contato.hasMany(Negocio, { foreignKey: 'contato_id' });
Negocio.belongsTo(Contato, { foreignKey: 'contato_id' });

PipelineEtapa.hasMany(Negocio, { foreignKey: 'etapa_id' });
Negocio.belongsTo(PipelineEtapa, { foreignKey: 'etapa_id' });

Usuario.hasMany(Negocio, { as: 'negociosResponsavel', foreignKey: 'responsavel_id' });
Negocio.belongsTo(Usuario, { as: 'responsavel', foreignKey: 'responsavel_id' });

module.exports = {
  Empresa,
  Usuario,
  Contato,
  CanalIntegracao,
  Conversa,
  Mensagem,
  PipelineEtapa,
  Negocio
};