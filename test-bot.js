// backend/check-conversas.js
require('dotenv').config();
const { sequelize } = require('./src/database');

async function checkConversasTable() {
  try {
    console.log('🔍 Verificando estrutura da tabela conversas...\n');
    
    // Buscar colunas da tabela
    const [columns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'maya-crm' 
      AND table_name = 'conversas'
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 Colunas encontradas:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });
    
    // Verificar se tem dados
    const [count] = await sequelize.query(`
      SELECT COUNT(*) as total FROM "maya-crm".conversas
    `);
    
    console.log(`\n📊 Total de conversas: ${count[0].total}`);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await sequelize.close();
  }
}

checkConversasTable();