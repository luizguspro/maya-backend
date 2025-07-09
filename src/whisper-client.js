const OpenAI = require('openai');
const fs = require('fs-extra');
const logger = require('./utils/logger');

class WhisperClient {
    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("A variável de ambiente OPENAI_API_KEY não está definida.");
        }
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async transcribeAudio(audioFilePath, language = 'pt') {
        try {
            if (!await fs.pathExists(audioFilePath)) {
                throw new Error(`Arquivo de áudio não encontrado em: ${audioFilePath}`);
            }

            const transcription = await this.openai.audio.transcriptions.create({
                file: fs.createReadStream(audioFilePath),
                model: 'whisper-1',
                language: language,
                response_format: 'json',
                temperature: 0.0 // Mais determinístico
            });

            logger.info('Transcrição realizada com sucesso.');

            return {
                success: true,
                text: transcription.text,
                language: transcription.language || language
            };
        } catch (error) {
            logger.error(`Erro na transcrição com a API Whisper: ${error.message}`);
            throw error;
        }
    }
}

module.exports = WhisperClient;
