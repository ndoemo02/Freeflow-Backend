import fs from 'fs';

const SUPABASE_URL = 'https://ezemaacyyvbpjlagchds.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) in environment.');
}

async function run() {
  const specRes = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${SUPABASE_KEY}`);
  const spec = await specRes.json();
  
  const tables = Object.keys(spec.definitions);
  console.log("Tables:", tables.join(', '));
  
  const relevantTables = ['restaurants', 'menu', 'menu_items', 'menu_variants', 'categories', 'orders', 'order_items'];
  
  const schemaMap = {};
  for (const table of relevantTables) {
    if (spec.definitions[table]) {
      const props = spec.definitions[table].properties;
      schemaMap[table] = Object.keys(props).map(col => {
        return {
          name: col,
          type: props[col].type,
          format: props[col].format,
          description: props[col].description || ''
        };
      });
    } else {
      schemaMap[table] = "DOES NOT EXIST";
    }
  }
  
  console.log(JSON.stringify(schemaMap, null, 2));
}
run();
