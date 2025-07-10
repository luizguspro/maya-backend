// backend/src/config/database.js
require('dotenv').config();

module.exports = {
  development: {
    username: 'postgres',
    password: '32494565',
    database: 'postgres', // Usar banco postgres
    host: 'localhost',
    dialect: 'postgres',
    logging: false,
    timezone: '-03:00',
    schema: 'maya-crm', // Especificar o schema
    define: {
      timestamps: true,
      underscored: false,
      underscoredAll: false,
      createdAt: 'criado_em',
      updatedAt: 'atualizado_em',
      schema: 'maya-crm' // Schema padrão para os models
    }
  },
  production: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || '32494565',
    database: process.env.DB_NAME || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    dialect: 'postgres',
    logging: false,
    timezone: '-03:00',
    schema: 'maya-crm',
    define: {
      timestamps: true,
      underscored: false,
      underscoredAll: false,
      createdAt: 'criado_em',
      updatedAt: 'atualizado_em',
      schema: 'maya-crm'
    }
  }
};