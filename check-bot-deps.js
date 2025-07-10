// backend/check-bot-deps.js
const deps = [
  '@whiskeysockets/baileys',
  '@hapi/boom',
  'pino',
  'qrcode-terminal',
  'fs-extra',
  'node-cron',
  'openai',
  'ffmpeg-static',
  'fluent-ffmpeg'
];

console.log('🔍 Verificando dependências do bot...\n');

let missing = [];

deps.forEach(dep => {
  try {
    require.resolve(dep);
    console.log(`✅ ${dep} - instalado`);
  } catch (e) {
    console.log(`❌ ${dep} - FALTANDO`);
    missing.push(dep);
  }
});

if (missing.length > 0) {
  console.log('\n⚠️  Dependências faltando:', missing.length);
  console.log('\nExecute o comando abaixo para instalar:');
  console.log(`npm install ${missing.join(' ')}`);
} else {
  console.log('\n✅ Todas as dependências estão instaladas!');
}

// Verificar arquivos necessários
console.log('\n🔍 Verificando arquivos necessários...');
const files = [
  './src/whisper-client.js',
  './src/ai-assistant.js',
  './src/property-db.js',
  './src/follow-up.js',
  './src/services/conversationService.js'
];

const fs = require('fs');
files.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} - existe`);
  } else {
    console.log(`❌ ${file} - FALTANDO`);
  }
});