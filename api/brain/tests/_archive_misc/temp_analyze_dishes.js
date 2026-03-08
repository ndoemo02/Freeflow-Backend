import fs from 'fs';

const TEST_DATASET = [
    { restaurant: 'Bar Praha', dish_name: 'Zupa czosnkowa', alias: 'zupa' },
    { restaurant: 'Bar Praha', dish_name: 'Smażony ser', alias: 'ser' },
    { restaurant: 'Bar Praha', dish_name: 'Gulasz wieprzowy z knedlikiem', alias: 'gulasz' },
    { restaurant: 'Tasty King Kebab', dish_name: 'Kebab w bułce', alias: 'kebab' },
    { restaurant: 'Tasty King Kebab', dish_name: 'Rollo Kebab', alias: 'rollo' },
    { restaurant: 'Tasty King Kebab', dish_name: 'Kebab Box', alias: 'box' },
    { restaurant: 'Restauracja Stara Kamienica', dish_name: 'Rolada śląska z kluskami i modrą kapustą', alias: 'rolada' },
    { restaurant: 'Restauracja Stara Kamienica', dish_name: 'Żurek śląski na maślance', alias: 'żurek' },
    { restaurant: 'Restauracja Stara Kamienica', dish_name: 'Kotlet schabowy z ziemniakami i kapustą', alias: 'schabowy' },
    { restaurant: 'Dwór Hubertus', dish_name: 'Kaczka pieczona w całości', alias: 'kaczka' },
    { restaurant: 'Dwór Hubertus', dish_name: 'Krem z borowików', alias: 'krem' },
    { restaurant: 'Dwór Hubertus', dish_name: 'Stek z polędwicy wołowej', alias: 'stek' },
    { restaurant: 'Rezydencja Luxury Hotel', dish_name: 'Filet z sandacza', alias: 'sandacz' },
    { restaurant: 'Rezydencja Luxury Hotel', dish_name: 'Krewetki w białym winie', alias: 'krewetki' },
    { restaurant: 'Rezydencja Luxury Hotel', dish_name: 'Crème brûlée', alias: 'creme' },
    { restaurant: 'Vien-Thien', dish_name: 'Zupa Pho Bo', alias: 'pho' },
    { restaurant: 'Vien-Thien', dish_name: 'Sajgonki z mięsem', alias: 'sajgonki' },
    { restaurant: 'Vien-Thien', dish_name: 'Pad Thai z krewetkami', alias: 'pad thai' },
    { restaurant: 'Callzone', dish_name: 'Pizza Pepperoni', alias: 'pepperoni' },
    { restaurant: 'Callzone', dish_name: 'Pizza Hawajska', alias: 'hawajska' },
    { restaurant: 'Callzone', dish_name: 'Pizza Margherita', alias: 'margherita' },
    { restaurant: 'Klaps Burgers', dish_name: 'BBQ Bacon Burger', alias: 'bbq' },
    { restaurant: 'Klaps Burgers', dish_name: 'Frytki belgijskie', alias: 'frytki' },
    { restaurant: 'Klaps Burgers', dish_name: 'Krążki cebulowe', alias: 'krążki' },
];

function generateCanonical(name) {
    if (!name) return '';
    let s = name.toLowerCase();
    s = s.replace(/\[.*?\]|\(.*?\)/g, '').trim();
    s = s.replace(/\d+(?:\.\d+)?\s*(?:l|ml|cm|g|kg|szt)\b/gi, '').trim();
    return s.replace(/\s+/g, ' ').trim();
}

function getSuggestedAlias(canonical) {
    const words = canonical.split(' ').filter(w => w.length > 3);
    if (words.length > 0) return words[0];
    return canonical.split(' ')[0];
}

async function run() {
    try {
        const rawContent = fs.readFileSync('C:/Users/frees/.gemini/antigravity/brain/393fe1dd-c913-4ecc-aed2-fdd2bafdb721/.system_generated/steps/806/output.txt', 'utf8');
        const json = JSON.parse(rawContent);
        const resultText = json.result;

        const arrayMatch = resultText.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (!arrayMatch) throw new Error("Could not find array in output");

        const dbDishes = JSON.parse(arrayMatch[0]);

        const reportLines = [];
        const testDishNames = TEST_DATASET.map(d => d.dish_name.toLowerCase());

        for (const dbDish of dbDishes) {
            const originalName = dbDish.name;
            if (!originalName) continue;

            const normalizedOriginalName = originalName.toLowerCase();
            const canonical = generateCanonical(originalName);
            const suggestedAlias = getSuggestedAlias(canonical);

            const inTest = testDishNames.includes(normalizedOriginalName);
            const longName = originalName.length > 30;
            const hasQuantity = /\d/.test(originalName) && /(l|ml|cm|g|kg|szt)/i.test(originalName);
            const hasBrackets = /\[|\]|\(|\)/.test(originalName);

            if (longName || hasQuantity || hasBrackets || !inTest) {
                reportLines.push({
                    originalName,
                    canonical,
                    suggestedAlias,
                    inTest,
                    longName,
                    hasQuantity,
                    hasBrackets
                });
            }
        }

        let output = '# Dish Reconciliation Report\n\n';
        output += '| Original Name | Canonical | Suggested Alias | Status | Issues |\n';
        output += '|---------------|-----------|-----------------|--------|--------|\n';

        const sortedReport = reportLines.sort((a, b) => {
            if (a.inTest !== b.inTest) return a.inTest ? 1 : -1;
            return a.originalName.localeCompare(b.originalName);
        });

        sortedReport.forEach(r => {
            const issues = [
                r.longName ? 'LONG' : '',
                r.hasQuantity ? 'QTY' : '',
                r.hasBrackets ? 'BRACKETS' : ''
            ].filter(Boolean).join(', ');

            const statusIcon = r.inTest ? '✅ OK' : '❌ MISSING';
            output += `| ${r.originalName} | ${r.canonical} | ${r.suggestedAlias} | ${statusIcon} | ${issues} |\n`;
        });

        fs.writeFileSync('c:/Firerfox Portable/Freeflow brain/backend/api/brain/tests/dish_recon_report.md', output, 'utf8');
        console.log("Report saved to dish_recon_report.md");
    } catch (e) {
        console.error("Runner Error:", e.message);
    }
}

run();
