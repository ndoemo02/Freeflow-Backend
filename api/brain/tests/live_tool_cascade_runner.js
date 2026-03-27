import { ToolRouter } from '../../voice/live/ToolRouter.js';

function flow(sessionId, name, steps) {
    return { sessionId, name, steps };
}

const FLOWS = [
    flow(`sess_live_flow_a_${Date.now()}`, 'A: discovery -> select -> menu', [
        { tool: 'find_nearby', args: { location: 'Piekary Śląskie' } },
        { tool: 'select_restaurant', args: { selection_text: 'pierwsza' } },
        { tool: 'show_menu', args: {} },
    ]),
    flow(`sess_live_flow_b_${Date.now()}`, 'B: select -> add item -> confirm add', [
        { tool: 'find_nearby', args: { location: 'Piekary Śląskie' } },
        { tool: 'select_restaurant', args: { selection_text: 'pierwsza' } },
        { tool: 'show_menu', args: {} },
        { tool: 'add_item_to_cart', args: { dish: 'Pierogi', quantity: 1 } },
        { tool: 'confirm_add_to_cart', args: {} },
    ]),
    flow(`sess_live_flow_c_${Date.now()}`, 'C: checkout bridge path', [
        { tool: 'open_checkout', args: {} },
        { tool: 'confirm_order', args: {} },
    ]),
];

async function run() {
    const router = new ToolRouter();
    const report = [];

    for (const testFlow of FLOWS) {
        const flowResult = {
            name: testFlow.name,
            sessionId: testFlow.sessionId,
            steps: [],
            ok: true,
        };

        for (const step of testFlow.steps) {
            const result = await router.executeToolCall({
                sessionId: testFlow.sessionId,
                toolName: step.tool,
                args: step.args,
                requestId: `${testFlow.name}-${step.tool}-${Date.now()}`,
            });

            const response = result?.response || {};
            const stepOk = Boolean(result?.ok) && Boolean(response?.ok);
            if (!stepOk) flowResult.ok = false;

            flowResult.steps.push({
                tool: step.tool,
                ok: stepOk,
                intent: response.intent || null,
                reply: (response.reply || '').slice(0, 90),
                trace: result.trace || [],
            });
        }

        report.push(flowResult);
    }

    console.log('━━━ Live Tool Cascade Runner ━━━');
    for (const item of report) {
        console.log(`${item.ok ? '✅' : '❌'} ${item.name} (${item.sessionId})`);
        for (const step of item.steps) {
            console.log(`   - ${step.tool}: ${step.ok ? 'ok' : 'fail'} | intent=${step.intent}`);
        }
    }

    const failed = report.filter((item) => !item.ok);
    if (failed.length > 0) {
        process.exitCode = 1;
        console.error(`\nFAIL: ${failed.length} flow(s) failed.`);
    } else {
        console.log('\nPASS: all live tool flows succeeded.');
    }
}

run().catch((error) => {
    console.error('[live_tool_cascade_runner] fatal:', error);
    process.exit(1);
});

