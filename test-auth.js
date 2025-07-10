// backend/test-auth.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize } = require('./src/database');
const { Usuario } = require('./src/models');

async function testAuth() {
  try {
    console.log('🔍 Testando conexão com banco...');
    await sequelize.authenticate();
    console.log('✅ Conectado ao banco');

    // Buscar usuário admin
    const usuario = await Usuario.findOne({
      where: { email: 'admin@mayacrm.com' }
    });

    if (usuario) {
      console.log('✅ Usuário encontrado:', usuario.email);
      
      // Testar senha
      const senhaCorreta = await bcrypt.compare('123456', usuario.senha);
      console.log('🔐 Senha correta?', senhaCorreta);
    } else {
      console.log('❌ Usuário não encontrado');
      
      // Criar usuário de teste
      console.log('📝 Criando usuário de teste...');
      const senhaHash = await bcrypt.hash('123456', 10);
      
      const novoUsuario = await Usuario.create({
        empresa_id: '00000000-0000-0000-0000-000000000001',
        nome: 'Administrador',
        email: 'admin@mayacrm.com',
        senha: senhaHash,
        cargo: 'Administrador',
        permissoes: ['all'],
        ativo: true
      });
      
      console.log('✅ Usuário criado:', novoUsuario.email);
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await sequelize.close();
  }
}

testAuth();