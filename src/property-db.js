const fs = require('fs-extra');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db.json');

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

        return results;
    } catch (error) {
        console.error("Erro ao buscar imóveis:", error);
        return [];
    }
}

module.exports = { searchProperties };