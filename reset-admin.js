// backend/test-login.js
require('dotenv').config();
const axios = require('axios');

async function testLogin() {
  try {
    console.log('🔍 Testando login...\n');
    
    const response = await axios.post('http://localhost:3001/api/auth/login', {
      email: 'admin@mayacrm.com',
      senha: '123456'
    });
    
    console.log('✅ Login bem-sucedido!');
    console.log('Token:', response.data.token);
    console.log('Usuário:', response.data.usuario);
    
  } catch (error) {
    console.error('❌ Erro no login:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Mensagem:', error.response.data);
    } else {
      console.error('Erro:', error.message);
    }
  }
}

// Aguardar 2 segundos para garantir que o servidor está rodando
setTimeout(testLogin, 2000);