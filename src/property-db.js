// src/property-db.js
const fs = require('fs-extra');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db.json');

// Função para formatar valores em Real brasileiro
function formatPrice(price) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(price);
}

async function searchProperties({ city, type, minPrice, maxPrice, bedrooms }) {
    try {
        const { properties } = await fs.readJson(dbPath);
        
        let results = properties;

        if (city) {
            results = results.filter(p => p.city.toLowerCase().includes(city.toLowerCase()));
        }
        if (type) {
            results = results.filter(p => p.type.toLowerCase() === type.toLowerCase());
        }
        if (bedrooms) {
            results = results.filter(p => p.bedrooms >= bedrooms);
        }
        if (minPrice) {
            results = results.filter(p => p.price >= minPrice);
        }
        if (maxPrice) {
            results = results.filter(p => p.price <= maxPrice);
        }

        // Adiciona preço formatado e informações extras a cada resultado
        return results.map(property => ({
            ...property,
            formattedPrice: formatPrice(property.price),
            // Adiciona valores padrão se não existirem
            bathrooms: property.bathrooms || 1,
            garage: property.garage || 1,
            area: property.area || 0,
            features: property.features || []
        }));
    } catch (error) {
        console.error("Erro ao buscar imóveis:", error);
        return [];
    }
}

module.exports = { searchProperties, formatPrice };