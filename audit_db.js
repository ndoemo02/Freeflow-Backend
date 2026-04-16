import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://ezemaacyyvbpjlagchds.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) in environment.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const schemaMap = {};
  
  // Phase 1 Schema might be easier fetched via PostgREST OpenAPI spec 
  // Let's do it via node-fetch instead of supabase-js which hides it
  const specRes = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${SUPABASE_KEY}`);
  const specUrl = await specRes.json();
  fs.writeFileSync('schema_openapi.json', JSON.stringify(specUrl, null, 2));

  // Data sampling: 3 restaurants
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('*')
    .limit(3);
    
  console.log("Restaurants sample:");
  console.log(JSON.stringify(restaurants, null, 2));
  
  // 5 menu items per restaurant
  const itemsMap = {};
  for (const r of restaurants) {
    const { data: items } = await supabase
      .from('menu_items')
      .select('*, menu_variants(*)') // Also fetch variants to see if there's a relation
      .eq('restaurant_id', r.id)
      .limit(5);
    itemsMap[r.id] = items;
  }
  
  console.log("\nMenu Items sample:");
  console.log(JSON.stringify(itemsMap, null, 2));
  
  // Categories
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .limit(3);
  
  console.log("\nCategories sample:");
  console.log(JSON.stringify(categories, null, 2));
}

run();
