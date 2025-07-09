// src/qualification-questions.js

const qualificationFlow = {
    inicial: {
        message: "Vejo que você está buscando um imóvel! 😊 Para eu poder te ajudar melhor, me conta: você procura um lugar para morar ou está pensando em investimento?",
        options: ["morar", "investir", "ambos"],
        next: "tipo_imovel"
    },
    
    tipo_imovel: {
        message: "Ótimo! E você já tem preferência entre casa ou apartamento? Ou está aberto a ambas opções?",
        options: ["casa", "apartamento", "ambos"],
        next: "cidade"
    },
    
    cidade: {
        message: "Perfeito! Em qual cidade você prefere? Atendemos:\n• Balneário Camboriú\n• Florianópolis\n• São José\n• Itajaí\n• Blumenau",
        options: ["balneário camboriú", "florianópolis", "são josé", "itajaí", "blumenau"],
        next: "quartos"
    },
    
    quartos: {
        message: "E quantos quartos você precisa? Isso me ajuda a filtrar as melhores opções!",
        options: ["1", "2", "3", "4 ou mais"],
        next: "pronto"
    },
    
    pronto: {
        message: "Excelente! Agora já sei exatamente o que você procura. Vou buscar as melhores opções para você! 🏠✨",
        action: "search"
    }
};

function getQualificationResponse(stage, userResponse) {
    const currentStage = qualificationFlow[stage] || qualificationFlow.inicial;
    
    // Analisa a resposta e decide o próximo passo
    if (currentStage.next) {
        return {
            nextStage: currentStage.next,
            message: qualificationFlow[currentStage.next].message
        };
    }
    
    return {
        action: currentStage.action,
        message: currentStage.message
    };
}

module.exports = { getQualificationResponse, qualificationFlow };