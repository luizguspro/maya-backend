// src/ai-assistant.js
const OpenAI = require('openai');
const { searchProperties } = require('./property-db');
const { scheduleVisit } = require('./scheduler');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const systemPrompt = `
Você é Léo, um corretor experiente da 'SC Imóveis'. Seja DIRETO e ASSERTIVO para converter leads em visitas.

REGRAS CRÍTICAS:
1. NUNCA forneça endereços completos - apenas bairro
2. Apresente NO MÁXIMO 3 imóveis
3. Seja MUITO ASSERTIVO - sempre direcione para agendamento
4. Após mostrar imóveis, IMEDIATAMENTE pergunte: "Qual você quer visitar primeiro?"
5. Se o cliente mostrar interesse, AGENDE NA HORA

FORMATO PARA APRESENTAR IMÓVEIS:
IMPORTANTE: Use [PROPERTY_BLOCK] para separar cada imóvel. Exemplo:

[PROPERTY_BLOCK]
✨ **Opção 1 - [Tipo] em [Bairro]**

💰 **[preço formatado]**
🛏️ **[quartos] quartos** | 🚿 **[banheiros] banheiros** | 🚗 **[vagas] vaga(s)**
📐 **[área]m²**

📝 *[Descrição em 1-2 linhas máximo]*

✅ **Por que você vai amar:**
- [Benefício 1]
- [Benefício 2]

🆔 **Código:** [ID]
[PROPERTY_BLOCK]

[Repita para cada imóvel]

[PROPERTY_BLOCK]
🎯 **Qual você quer conhecer primeiro?**

Digite 1, 2 ou 3 para agendar sua visita HOJE ainda! 📱
[PROPERTY_BLOCK]

FLUXO DE CONVERSÃO RÁPIDA:
1. Máximo 3 perguntas de qualificação
2. Mostra imóveis
3. IMEDIATAMENTE: "Qual você quer visitar?"
4. Se hesitar: "Posso agendar para amanhã às 10h ou 14h. Qual prefere?"
5. NUNCA deixe a conversa esfriar

RESPOSTAS ASSERTIVAS:
- "Não sei" → "Sem problemas! Vou te mostrar os 3 mais procurados. Um deles vai ser perfeito!"
- "Preciso pensar" → "Claro! Enquanto pensa, vamos garantir um horário. Você pode cancelar depois!"
- "Tá caro" → "Entendo! Esse tem o melhor custo-benefício da região. Vamos conhecer?"

APÓS 2 INTERAÇÕES sem agendamento:
"[Nome], percebi que você tem interesse! Vou reservar 15 minutos amanhã às 10h para conversarmos. Se não puder, é só me avisar! 😊"

Ferramentas disponíveis:
- 'searchProperties': busca imóveis
- 'scheduleVisit': agenda visitas

Seja SEMPRE otimista e crie urgência: "Esse imóvel tem muita procura!"
`;

const tools = [
    {
        type: "function",
        function: {
            name: "searchProperties",
            description: "Busca por imóveis no banco de dados com base nos critérios do cliente.",
            parameters: {
                type: "object",
                properties: {
                    city: { type: "string", description: "A cidade do imóvel, ex: 'Florianópolis'" },
                    type: { type: "string", description: "O tipo de imóvel, ex: 'Casa'" },
                    bedrooms: { type: "number", description: "O número mínimo de quartos" },
                    minPrice: { type: "number", description: "Preço mínimo" },
                    maxPrice: { type: "number", description: "Preço máximo" }
                },
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "scheduleVisit",
            description: "Agenda uma visita para um imóvel específico em uma data e hora.",
            parameters: {
                type: "object",
                properties: {
                    propertyId: { type: "string", description: "O ID do imóvel, ex: 'BC001'" },
                    date: { type: "string", description: "A data desejada para a visita, formato AAAA-MM-DD" },
                    time: { type: "string", description: "O horário desejado, formato HH:MM" },
                    customerName: { type: "string", description: "O nome do cliente para o agendamento" },
                    isPhoneCall: { type: "boolean", description: "Se é uma ligação ao invés de visita presencial" },
                },
                required: ["propertyId", "date", "time", "customerName"],
            },
        },
    }
];

async function getAssistedResponse(conversationHistory) {
    const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory
    ];

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages,
        tools: tools,
        tool_choice: "auto",
        temperature: 0.8 // Um pouco mais criativo e assertivo
    });

    const responseMessage = response.choices[0].message;
    const toolCalls = responseMessage.tool_calls;

    if (toolCalls) {
        messages.push(responseMessage);

        for (const toolCall of toolCalls) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            let functionResponse;

            if (functionName === 'searchProperties') {
                // Limita a 3 resultados
                const allResults = await searchProperties(functionArgs);
                functionResponse = allResults.slice(0, 3);
            } else if (functionName === 'scheduleVisit') {
                functionResponse = await scheduleVisit(
                    functionArgs.propertyId,
                    functionArgs.date,
                    functionArgs.time,
                    functionArgs.customerName,
                    functionArgs.isPhoneCall
                );
            }
            
            messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: functionName,
                content: JSON.stringify(functionResponse),
            });
        }

        const finalResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            temperature: 0.8
        });

        return finalResponse.choices[0].message.content;
    } else {
        return responseMessage.content;
    }
}

module.exports = { getAssistedResponse };