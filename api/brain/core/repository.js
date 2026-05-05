
import { supabase } from '../../_supabase.js';
import { calculateDistance } from '../helpers.js';

// Base Interface (Documentation Only in JS)
// interface RestaurantRepository {
//   searchRestaurants(city: string, cuisine?: string): Promise<Restaurant[]>;
//   getMenu(restaurantId: string): Promise<MenuItem[]>;
// }

export class SupabaseRestaurantRepository {
    async searchRestaurants(city, cuisine) {
        let query = supabase
            .from('restaurants')
            .select('id, name, address, city, cuisine_type, lat, lng, delivery_available, price_level, taxonomy_groups, taxonomy_cats, taxonomy_tags, maps_rating, maps_ratings_total, opening_hours, phone, website, image_url, photo_gallery')
            .ilike('city', `%${city}%`);

        if (cuisine) {
            query = query.ilike('cuisine_type', `%${cuisine}%`);
        }

        const { data, error } = await query.limit(10);
        if (error) throw error;
        return data || [];
    }

    async searchNearby(lat, lng, radiusKm = 10, cuisine = null) {
        // Bounding box approximation (1 deg lat ~ 111km)
        // 0.1 deg ~ 11km
        const delta = radiusKm / 111;

        let query = supabase
            .from('restaurants')
            .select('id, name, address, city, cuisine_type, lat, lng, delivery_available, price_level, taxonomy_groups, taxonomy_cats, taxonomy_tags, maps_rating, maps_ratings_total, opening_hours, phone, website, image_url, photo_gallery')
            .gte('lat', lat - delta)
            .lte('lat', lat + delta)
            .gte('lng', lng - delta)
            .lte('lng', lng + delta);

        if (cuisine) {
            query = query.ilike('cuisine_type', `%${cuisine}%`);
        }

        const { data, error } = await query.limit(50); // Get more candidates for sorting
        if (error) throw error;

        const results = (data || [])
            .map(r => ({
                ...r,
                distance: calculateDistance(lat, lng, r.lat, r.lng)
            }))
            .filter(r => r.distance <= radiusKm)
            .sort((a, b) => a.distance - b.distance);

        return results.slice(0, 5); // Return top 5 closest
    }

    async getMenu(restaurantId) {
        const { data, error } = await supabase
            .from('menu_items_v2')
            .select('id, name, price_pln, description, category, available, section_order')
            .eq('restaurant_id', restaurantId)
            .order('section_order', { ascending: true })
            .order('category', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw error;
        return data || [];
    }
}

export class InMemoryRestaurantRepository {
    constructor(data) {
        this.restaurants = data.restaurants || [];
        this.menuSamples = data.menuSamples || {};
    }

    async searchRestaurants(city, cuisine) {
        // console.log(`[InMemory] Search: city="${city}", cuisine="${cuisine}" (Total: ${this.restaurants.length})`);
        if (!city) return [];

        const cityNorm = city.toLowerCase();

        const matches = this.restaurants.filter(r => {
            const rCity = (r.city || "").toLowerCase();
            if (!rCity.includes(cityNorm)) return false;

            // Cuisine check (ilike)
            if (cuisine) {
                const cType = (r.cuisine_type || "").toLowerCase();
                if (!cType.includes(cuisine.toLowerCase())) return false;
            }
            return true;
        });

        return matches.slice(0, 10);
    }

    async searchNearby(lat, lng, radiusKm = 10, cuisine = null) {
        const matches = this.restaurants.filter(r => {
            if (!r.lat || !r.lng) return false;
            if (cuisine) {
                const cType = (r.cuisine_type || "").toLowerCase();
                if (!cType.includes(cuisine.toLowerCase())) return false;
            }
            return true;
        })
            .map(r => ({
                ...r,
                distance: calculateDistance(lat, lng, r.lat, r.lng)
            }))
            .filter(r => r.distance <= radiusKm)
            .sort((a, b) => a.distance - b.distance);

        return matches.slice(0, 5);
    }

    async getMenu(restaurantId) {
        const sample = this.menuSamples[restaurantId];
        return sample ? sample.items : [];
    }
}
