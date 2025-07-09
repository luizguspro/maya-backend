// src/ai-assistant.js
const OpenAI = require('openai');
const { searchProperties } = require('./property-db');
const { scheduleVisit } = require('./scheduler'); // Nova ferramenta

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const systemPrompt = `
Você é Léo, um assistente virtual especialista da 'SC Imóveis', uma imobiliária de alto padrão em Santa Catarina.
Sua comunicação é sempre clara, proativa e amigável.
Seu objetivo principal é ajudar os clientes a encontrar o imóvel ideal e agendar visitas.
As cidades que você atende são: Balneário Camboriú, Florianópolis, São José, Itajaí e Blumenau.

Você tem acesso a duas ferramentas:
1. 'searchProperties': Use esta ferramenta quando o cliente expressar interesse em buscar imóveis.
2. 'scheduleVisit': Use esta ferramenta quando o cliente pedir explicitamente para agendar uma visita a um imóvel específico. Ele precisa fornecer o ID do imóvel, a data e o horário.

Ao encontrar imóveis, apresente-os de forma atraente, com ID, tipo, endereço, preço e descrição. Mencione que há fotos disponíveis.
Se o cliente pedir para agendar, colete as informações necessárias (ID do imóvel, data, hora) antes de usar a ferramenta. Peça o nome dele para o agendamento.
Para todas as outras perguntas, responda de forma natural e informativa.
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
                },
                required: ["propertyId", "date", "time", "customerName"],
            },
        },
    }
];

// Agora a função recebe o histórico da conversa
async function getAssistedResponse(conversationHistory) {
    const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory // Adiciona todas as mensagens anteriores
    ];

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages,
        tools: tools,
        tool_choice: "auto",
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
                functionResponse = await searchProperties(functionArgs);
            } else if (functionName === 'scheduleVisit') {
                functionResponse = await scheduleVisit(
                    functionArgs.propertyId,
                    functionArgs.date,
                    functionArgs.time,
                    functionArgs.customerName
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
        });

        return finalResponse.choices[0].message.content;
    } else {
        return responseMessage.content;
    }
}

module.exports = { getAssistedResponse };
