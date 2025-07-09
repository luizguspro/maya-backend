const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const logger = require('./utils/logger');

class AudioProcessor {
    constructor() {
        this.supportedMimetypes = ['audio/ogg; codecs=opus', 'audio/mpeg', 'audio/wav', 'audio/mp4'];
        this.maxSize = parseInt(process.env.MAX_AUDIO_SIZE) || 25000000; // 25MB
    }

    async isValidAudioMessage(message) {
        if (!message.hasMedia) return false;

        const media = await message.downloadMedia();
        if (!media || !media.data) {
            logger.warn('Mensagem sem mídia válida para download.');
            return false;
        }

        const isSupported = this.supportedMimetypes.some(mimetype => media.mimetype.startsWith(mimetype.split(';')[0]));
        if (!isSupported) {
            logger.warn(`Formato de mídia não suportado: ${media.mimetype}`);
            return false;
        }
        
        const audioSize = Buffer.from(media.data, 'base64').length;
        if (audioSize > this.maxSize) {
            logger.warn(`Arquivo de áudio excede o tamanho máximo de ${this.maxSize} bytes.`);
            return false;
        }

        return true;
    }

    async downloadAndSaveAudio(message, outputPath) {
        try {
            const media = await message.downloadMedia();
            if (!media) {
                throw new Error('Falha ao baixar mídia do WhatsApp.');
            }
            
            const buffer = Buffer.from(media.data, 'base64');
            await fs.ensureDir(path.dirname(outputPath));
            await fs.writeFile(outputPath, buffer);
            
            return {
                success: true,
                filePath: outputPath,
                mimetype: media.mimetype,
                size: buffer.length
            };
        } catch (error) {
            logger.error(`Erro ao salvar áudio: ${error.message}`);
            throw new Error(`Erro ao salvar áudio: ${error.message}`);
        }
    }

    convertToWav(inputPath, outputPath) {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(inputPath)) {
                return reject(new Error(`Arquivo de entrada não encontrado: ${inputPath}`));
            }

            ffmpeg(inputPath)
                .toFormat('wav')
                .audioCodec('pcm_s16le') // Codec WAV padrão
                .audioFrequency(16000)   // Frequência recomendada para Whisper
                .audioChannels(1)        // Canal mono
                .on('end', () => {
                    logger.info(`Áudio convertido para WAV: ${outputPath}`);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    logger.error(`Erro na conversão do áudio: ${err.message}`);
                    reject(new Error(`Erro na conversão com FFmpeg: ${err.message}`));
                })
                .save(outputPath);
        });
    }
}

module.exports = AudioProcessor;
