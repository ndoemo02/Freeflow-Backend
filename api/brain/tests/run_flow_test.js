
import { NLURouter } from '../nlu/router.js';
import { BrainPipeline } from '../core/pipeline.js';
import { InMemoryRestaurantRepository } from '../core/repository.js';
import { getSession } from '../session/sessionStore.js';

async function runTest() {
    const nlu = new NLURouter();
    const repo = new InMemoryRestaurantRepository({
        restaurants: [
            { id: '569a7d29-57be-4224-bdf3-09c483415cea', name: 'Klaps Burgers', city: 'Piekary', cuisine_type: 'Amerykańska', lat: 50.38, lng: 18.94 }
        ],
        menuSamples: {
            '569a7d29-57be-4224-bdf3-09c483415cea': {
                items: [
                    { id: 'item-1', name: 'Żwirek i Muchomorek Standard', price_pln: 35, category: 'burger', available: true },
                    { id: 'item-2', name: 'Klasyk', price_pln: 28, category: 'burger', available: true }
                ]
            }
        }
    });

    const pipeline = new BrainPipeline({ nlu, repository: repo });
    const sessionId = 'test-flow-' + Date.now();

    const steps = [
        { text: "Pokaż restauracje w pobliżu", label: "Step 1: Discovery" },
        { text: "Klaps Burgers", label: "Step 2: Selection" },
        { text: "Pokaż menu", label: "Step 3: Menu Request" },
        { text: "Żwirek i Muchomorek Standard", label: "Step 4: Dish Selection (DISH_GUARD)" },
        { text: "tak", label: "Step 5: Confirmation" }
    ];

    console.log(`\n🚀 Starting Ordering Flow Test [Session: ${sessionId}]`);
    console.log(`Mode: V2 Modular Pipeline (EXPERIMENTAL)`);
    console.log(`----------------------------------------------------------------`);

    let allPassed = true;

    for (const step of steps) {
        console.log(`\n📍 ${step.label}: "${step.text}"`);

        try {
            const result = await pipeline.process(sessionId, step.text);
            const session = getSession(sessionId);

            console.log(`- Intent:          ${result.intent}`);
            console.log(`- Domain:          ${result.domain || 'N/A'}`);
            console.log(`- Source:          ${result.meta?.source || result.source || 'N/A'}`);
            console.log(`- Entities:        ${JSON.stringify(result.context?.entities || result.entities || {})}`);
            console.log(`- ContextUpdates:  ${JSON.stringify(result.contextUpdates || {})}`);

            const cartItems = result.meta?.cart?.items || session?.cart?.items || [];
            console.log(`- Cart Items:      ${cartItems.length}`);
            console.log(`- PendingOrder:    ${!!(result.contextUpdates?.pendingOrder || session?.pendingOrder)}`);
            console.log(`- Reply:           "${result.reply}"`);
            console.log(`- Conv Closed:     ${result.conversationClosed || false}`);

            // Verification logic
            if (step.text === "Żwirek i Muchomorek Standard") {
                if (result.intent !== 'create_order') {
                    console.error(`   ❌ FAIL: Expected create_order but got ${result.intent}`);
                    allPassed = false;
                } else if (result.meta?.source !== 'dish_guard') {
                    console.error(`   ❌ FAIL: Expected meta.source 'dish_guard' but got ${result.meta?.source}`);
                    allPassed = false;
                } else {
                    console.log(`   ✅ SUCCESS: DISH_GUARD captured intended order.`);
                }
            }

            if (step.text === "tak") {
                // Test the EFFECT, not the raw intent (ICM may remap intent name)
                if (cartItems.length !== 1) {
                    console.error(`   ❌ FAIL: Cart should have 1 item, has ${cartItems.length}`);
                    allPassed = false;
                } else if (result.conversationClosed === true) {
                    console.error(`   ❌ FAIL: ConversationClosed should be FALSE for add_to_cart`);
                    allPassed = false;
                } else {
                    console.log(`   ✅ SUCCESS: Add to cart confirmed. Cart=${cartItems.length}, session alive.`);
                }
            }
        } catch (e) {
            console.error(`   ❌ CRITICAL ERROR in ${step.label}:`, e.message);
            console.error(e.stack);
            allPassed = false;
        }
    }

    console.log(`\n----------------------------------------------------------------`);
    console.log(`🏁 TEST RESULT: ${allPassed ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`----------------------------------------------------------------\n`);
}

runTest().catch(e => console.error(e));
