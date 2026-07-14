import { supabase } from "../../_supabase.js";
import { fuzzyMatch } from "../helpers.js";
import { normalize } from "../utils/normalizeText.js";

export const nearbyCitySuggestions = {
  'bytom': ['Piekary Śląskie', 'Katowice', 'Zabrze'],
  'katowice': ['Piekary Śląskie', 'Bytom', 'Chorzów'],
  'zabrze': ['Piekary Śląskie', 'Bytom', 'Gliwice'],
  'gliwice': ['Zabrze', 'Piekary Śląskie'],
  'chorzow': ['Katowice', 'Piekary Śląskie', 'Bytom']
};

export async function findRestaurant(name) {
  if (!name) return null;

  try {
    const { data: restaurants, error } = await supabase
      .from('restaurants')
      .select('id, name, address, city, lat, lng')
      .eq('is_active', true);

    if (error || !restaurants?.length) {
      console.warn('⚠️ findRestaurant: brak danych z Supabase');
      return null;
    }

    // Fuzzy matching z Levenshtein
    const matched = restaurants.find(r => fuzzyMatch(name, r.name, 3));
    if (matched) {
      console.log(`✅ Matched restaurant: "${name}" → ${matched.name}`);
      return matched;
    }

    // 🔧 Alias fallback
    const alias = restaurants.find(r => normalize(r.name).startsWith(normalize(name).split(' ')[0]));
    if (alias) {
      console.log(`✅ Alias match: "${name}" → ${alias.name}`);
      return alias;
    }

    console.warn(`⚠️ No match for restaurant: "${name}"`);
    return null;
  } catch (err) {
    console.error('⚠️ findRestaurant error:', err.message);
    return null;
  }
}
