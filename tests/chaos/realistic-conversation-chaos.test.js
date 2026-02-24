/**
 * Realistic Conversation Chaos Tests
 * ====================================
 * Weryfikuje elastyczność i ciągłość kontraktu V2 w obliczu zmian zdania,
 * skoków kontekstu i doprecyzowań, zgodnie z najnowszym planem i V2.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../../api/server-vercel.js';

process.env.PORT = 0;

// Load scenarios
const scenariosPath = path.resolve(__dirname, 'SCENARIOS.pl.json');
let scenarios = [];
try {
    scenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));
} catch (e) {
    console.warn("Plik SCENARIOS.pl.json jeszcze nie istnieje. Zostanie wygenerowany.");
}

const VALID_V2_INTENTS = [
    'find_nearby', 'show_menu', 'menu_request', 'create_order',
    'confirm_order', 'cancel_order', 'select_restaurant',
    'show_more_options', 'recommend', 'unknown',
    'duplicate_request', 'session_locked', 'confirm_restaurant',
    'confirm_add_to_cart', 'choose_restaurant', 'back', 'repeat', 'stop', 'clarify_order', 'smalltalk'
];

let reportData = {
    totalScenarios: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    flakyDemo: 0,
    demoTotal: 0,
    failTranscripts: []
};

describe('Chaos Tests: V2 Realistic Conversation Flow', () => {

    beforeAll(() => {
        // Disable real LLM falling back for regular tests if it costs money,
        // but since these ARE chaos tests needing NLU/LLM, we leave USE_LLM_INTENT on.
        process.env.EXPERT_MODE = 'true';
        process.env.USE_LLM_INTENT = 'true';

        reportData.totalScenarios = scenarios.length;
    });

    afterAll(() => {
        // Generate REPORT.md
        const reportPath = path.resolve(__dirname, 'REPORT.md');
        let reportContent = `# Raport z testów Chaos V2\n\n`;
        reportContent += `| Status | Ilość |\n|--------|-------|\n`;
        reportContent += `| :white_check_mark: Zakończone sukcesem | ${reportData.passed} |\n`;
        reportContent += `| :x: Zakończone błędem | ${reportData.failed} |\n`;
        reportContent += `| :warning: Pomięte | ${reportData.skipped} |\n\n`;

        reportContent += `## Stabilność DEMO FLOW x5\n`;
        reportContent += `Wykonano ${reportData.demoTotal} iteracji pętli demowej. Z tego udane: ${reportData.demoTotal - reportData.flakyDemo}. Flaky: ${reportData.flakyDemo}\n\n`;

        if (reportData.failTranscripts.length > 0) {
            reportContent += `## Top 5 Fail Transcripts\n\n`;
            reportData.failTranscripts.slice(0, 5).forEach(transcript => {
                reportContent += `### Scenariusz: ${transcript.scenarioId} (Step ${transcript.stepIdx})\n`;
                reportContent += `- **Input:** "${transcript.input}"\n`;
                reportContent += `- **Expected (Allowed):** ${transcript.expected}\n`;
                reportContent += `- **Actual Intent:** ${transcript.actualIntent}\n`;
                reportContent += `- **Status Code:** ${transcript.status}\n`;
                reportContent += `- **Error details:**\n\`\`\`json\n${JSON.stringify(transcript.responseBody, null, 2)}\n\`\`\`\n\n`;
            });
        }

        fs.writeFileSync(reportPath, reportContent);
        console.log(`Zapisano raport do ${reportPath}`);
    });

    // Filtrujemy kategorie zwykłych scenariuszy
    const regularScenarios = scenarios.filter(s => s.category !== 'demo_flow');
    const demoScenarios = scenarios.filter(s => s.category === 'demo_flow');

    // 1. ODPALAMY STANDARDOWE SCENARIUSZE (Zmiany zdania, doprecyzowania itp.)
    if (regularScenarios.length > 0) {
        describe.each(regularScenarios)('Category: $category - Scenario: $id - $description', (scenario) => {
            it('powinien przejść naturalną polską rozmowę po kolei bez padnięć 500', async () => {
                const sid = scenario.session_id + '-' + Date.now(); // randomizujemy db session state

                for (let i = 0; i < scenario.steps.length; i++) {
                    const step = scenario.steps[i];

                    const res = await request(app)
                        .post('/api/brain/v2')
                        .send({ text: step.input, session_id: sid });

                    const logFail = () => {
                        reportData.failTranscripts.push({
                            scenarioId: scenario.id,
                            stepIdx: i + 1,
                            input: step.input,
                            expected: step.allowedIntents.join(', '),
                            actualIntent: res.body.intent || 'NONE',
                            status: res.status,
                            responseBody: res.body
                        });
                        reportData.failed++;
                    };

                    try {
                        expect(res.status).not.toBe(500);
                        expect(res.body).toHaveProperty('reply');

                        // Zwrócony intent MUSI BYĆ z góry znanych ogólnych formatowych intencji.
                        if (res.body.intent) {
                            expect(VALID_V2_INTENTS).toContain(res.body.intent);
                        }

                        // Branch tolerant (oczekiwany konkretny podzbiór dla danego zdania)
                        if (step.allowedIntents && step.allowedIntents.length > 0 && res.body.intent) {
                            expect(step.allowedIntents).toContain(res.body.intent);
                        }
                    } catch (e) {
                        logFail();
                        throw e; // przerwij dany test case żeby Vitest zauważył crash
                    }
                }
                reportData.passed++;
            }, 60000); // Wydłużamy timeout do 60s per scenario (na ew. pingi do NLU)
        });
    }

    // 2. ODPALAMY DEMO FLOW W PĘTLI X5
    if (demoScenarios.length > 0) {
        describe('DEMO LOOP STABILITY X5', () => {
            demoScenarios.forEach(demoFlow => {
                for (let run = 1; run <= 5; run++) {
                    it(`Uruchomienie ${run}/5 dla DEMO ${demoFlow.id}`, async () => {
                        const sid = `${demoFlow.session_id}-ITER-${run}-${Date.now()}`;
                        reportData.demoTotal++;

                        for (let i = 0; i < demoFlow.steps.length; i++) {
                            const step = demoFlow.steps[i];

                            const res = await request(app)
                                .post('/api/brain/v2')
                                .send({ text: step.input, session_id: sid });

                            try {
                                expect(res.status).not.toBe(500);
                                expect(res.body).toHaveProperty('reply');

                                if (step.allowedIntents && step.allowedIntents.length > 0 && res.body.intent) {
                                    expect(step.allowedIntents).toContain(res.body.intent);
                                }
                            } catch (e) {
                                reportData.flakyDemo++;
                                reportData.failTranscripts.push({
                                    scenarioId: `${demoFlow.id} (Run ${run})`,
                                    stepIdx: i + 1,
                                    input: step.input,
                                    expected: step.allowedIntents.join(', '),
                                    actualIntent: res.body.intent || 'NONE',
                                    status: res.status,
                                    responseBody: res.body
                                });
                                throw e;
                            }
                        }
                    }, 60000);
                }
            });
        });
    }
});
