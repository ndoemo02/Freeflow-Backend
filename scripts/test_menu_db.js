import { config } from 'dotenv';
config();
import { supabase } from '../api/_supabase.js';
import fs from 'fs';

async function run() {
    const { data } = await supabase.from('menu_items_v2').select('id, name, base_name').eq('restaurant_id', '569a7d29-57be-4224-bdf3-09c483415cea');
    fs.writeFileSync('klaps.txt', JSON.stringify(data, null, 2));
}
run();
