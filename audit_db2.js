import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ezemaacyyvbpjlagchds.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) in environment.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  
  // Try menu items without relation check
  const { data: items, error: err1 } = await supabase
    .from('menu_items')
    .select('*')
    .limit(10);
    
  console.log("Menu Items Error:", err1 ? err1.message : "None");
  console.log("Menu Items sample count:", items ? items.length : 0);
  if (items && items.length > 0) {
     console.log("Sample Item:", JSON.stringify(items[0], null, 2));
  }

  // Orders
  const { data: orders, error: err2 } = await supabase
    .from('orders')
    .select('*')
    .limit(2);
  console.log("Orders Error:", err2 ? err2.message : "None");
  if (orders && orders.length > 0) console.log("Order sample:", orders[0]);

  // Order Items
  const { data: orderItems, error: err3 } = await supabase
    .from('order_items')
    .select('*')
    .limit(2);
  console.log("Order Items Error:", err3 ? err3.message : "None");
  if (orderItems && orderItems.length > 0) console.log("Order Item sample:", orderItems[0]);
  
  // Categories
  const { data: cat, error: err4 } = await supabase
    .from('categories')
    .select('*')
    .limit(2);
  console.log("Categories Error:", err4 ? err4.message : "None");
  if (cat && cat.length > 0) console.log("Cat sample:", cat[0]);
}
run();
