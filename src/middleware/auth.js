// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { Usuario } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'maya-crm-secret-key-mudar-em-producao';

const authMiddleware = async (req, res, next) => {
  try {
    // Pegar token do header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer '
    
    // Verificar token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Buscar usuário
    const usuario = await Usuario.findByPk(decoded.id, {
      attributes: { exclude: ['senha'] }
    });
    
    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
    }
    
    // Adicionar usuário ao request
    req.usuario = usuario;
    req.usuarioId = usuario.id;
    req.empresaId = usuario.empresa_id;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    
    console.error('Erro no middleware de autenticação:', error);
    return res.status(500).json({ error: 'Erro ao verificar autenticação' });
  }
};

// Middleware opcional - não bloqueia se não tiver token
const authOptional = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      
      const usuario = await Usuario.findByPk(decoded.id, {
        attributes: { exclude: ['senha'] }
      });
      
      if (usuario && usuario.ativo) {
        req.usuario = usuario;
        req.usuarioId = usuario.id;
        req.empresaId = usuario.empresa_id;
      }
    }
    
    next();
  } catch (error) {
    // Ignora erros e continua sem autenticação
    next();
  }
};

module.exports = {
  authMiddleware,
  authOptional,
  JWT_SECRET
};