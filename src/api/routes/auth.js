// backend/src/api/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Usuario, Empresa } = require('../../models');
const { authMiddleware, JWT_SECRET } = require('../../middleware/auth');
const logger = require('../../utils/logger');

// Gerar token JWT
const generateToken = (usuario) => {
  return jwt.sign(
    { 
      id: usuario.id,
      email: usuario.email,
      empresa_id: usuario.empresa_id
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// POST /api/auth/register - Criar nova conta
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha, telefone, empresa_nome } = req.body;

    // Validações
    if (!nome || !email || !senha) {
      return res.status(400).json({ 
        error: 'Nome, email e senha são obrigatórios' 
      });
    }

    if (senha.length < 6) {
      return res.status(400).json({ 
        error: 'A senha deve ter pelo menos 6 caracteres' 
      });
    }

    // Verificar se email já existe
    const usuarioExistente = await Usuario.findOne({ where: { email } });
    if (usuarioExistente) {
      return res.status(400).json({ 
        error: 'Este email já está cadastrado' 
      });
    }

    // Criar empresa se fornecida
    let empresaId = process.env.DEFAULT_EMPRESA_ID;
    if (empresa_nome) {
      const novaEmpresa = await Empresa.create({
        nome: empresa_nome,
        email: email,
        plano: 'trial'
      });
      empresaId = novaEmpresa.id;
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Criar usuário
    const novoUsuario = await Usuario.create({
      empresa_id: empresaId,
      nome,
      email,
      senha: senhaHash,
      telefone,
      cargo: 'Administrador',
      permissoes: ['all'],
      ativo: true
    });

    // Gerar token
    const token = generateToken(novoUsuario);

    // Retornar usuário (sem senha) e token
    const usuarioResponse = novoUsuario.toJSON();
    delete usuarioResponse.senha;

    res.status(201).json({
      success: true,
      usuario: usuarioResponse,
      token
    });

    logger.info(`Novo usuário registrado: ${email}`);

  } catch (error) {
    logger.error('Erro ao registrar usuário:', error);
    res.status(500).json({ 
      error: 'Erro ao criar conta. Tente novamente.' 
    });
  }
});

// POST /api/auth/login - Fazer login
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    // Validações
    if (!email || !senha) {
      return res.status(400).json({ 
        error: 'Email e senha são obrigatórios' 
      });
    }

    // Buscar usuário
    const usuario = await Usuario.findOne({ 
      where: { email },
      include: [{
        model: Empresa,
        attributes: ['id', 'nome', 'plano']
      }]
    });

    if (!usuario) {
      return res.status(401).json({ 
        error: 'Email ou senha incorretos' 
      });
    }

    // Verificar se está ativo
    if (!usuario.ativo) {
      return res.status(401).json({ 
        error: 'Conta desativada. Entre em contato com o suporte.' 
      });
    }

    // Verificar senha
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ 
        error: 'Email ou senha incorretos' 
      });
    }

    // Atualizar último login
    await usuario.update({ ultimo_login: new Date() });

    // Gerar token
    const token = generateToken(usuario);

    // Retornar usuário (sem senha) e token
    const usuarioResponse = usuario.toJSON();
    delete usuarioResponse.senha;

    res.json({
      success: true,
      usuario: usuarioResponse,
      token
    });

    logger.info(`Login realizado: ${email}`);

  } catch (error) {
    logger.error('Erro ao fazer login:', error);
    res.status(500).json({ 
      error: 'Erro ao fazer login. Tente novamente.' 
    });
  }
});

// GET /api/auth/me - Obter usuário atual
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const usuario = await Usuario.findByPk(req.usuarioId, {
      attributes: { exclude: ['senha'] },
      include: [{
        model: Empresa,
        attributes: ['id', 'nome', 'plano']
      }]
    });

    if (!usuario) {
      return res.status(404).json({ 
        error: 'Usuário não encontrado' 
      });
    }

    res.json({
      success: true,
      usuario
    });

  } catch (error) {
    logger.error('Erro ao buscar usuário:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar dados do usuário' 
    });
  }
});

// POST /api/auth/logout - Fazer logout
router.post('/logout', authMiddleware, (req, res) => {
  // Como usamos JWT, o logout é feito no cliente removendo o token
  // Aqui podemos registrar o evento ou invalidar o token em um blacklist
  logger.info(`Logout realizado: ${req.usuario.email}`);
  
  res.json({
    success: true,
    message: 'Logout realizado com sucesso'
  });
});

// POST /api/auth/forgot-password - Solicitar recuperação de senha
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        error: 'Email é obrigatório' 
      });
    }

    const usuario = await Usuario.findOne({ where: { email } });
    
    if (!usuario) {
      // Por segurança, não revelamos se o email existe
      return res.json({
        success: true,
        message: 'Se o email existir, você receberá instruções de recuperação'
      });
    }

    // TODO: Implementar envio de email com token de recuperação
    // Por enquanto, apenas loga
    logger.info(`Recuperação de senha solicitada para: ${email}`);

    res.json({
      success: true,
      message: 'Se o email existir, você receberá instruções de recuperação'
    });

  } catch (error) {
    logger.error('Erro ao solicitar recuperação de senha:', error);
    res.status(500).json({ 
      error: 'Erro ao processar solicitação' 
    });
  }
});

// POST /api/auth/reset-password - Resetar senha
router.post('/reset-password', async (req, res) => {
  try {
    const { token, novaSenha } = req.body;

    // TODO: Implementar verificação do token de recuperação
    // Por enquanto, retorna erro
    return res.status(400).json({ 
      error: 'Funcionalidade em desenvolvimento' 
    });

  } catch (error) {
    logger.error('Erro ao resetar senha:', error);
    res.status(500).json({ 
      error: 'Erro ao resetar senha' 
    });
  }
});

module.exports = router;