/**
 * backfill-place-ids.ts
 * ─────────────────────────────────────────────────────────────
 * Populates the `maps_place_id` column on the `restaurants` table
 * by searching Google Places API.
 *
 * Usage:
 *   DRY_RUN=true npx ts-node backfill-place-ids.ts
 *   DRY_RUN=false npx ts-node backfill-place-ids.ts
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ezemaacyyvbpjlagchds.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const DRY_RUN = process.env.DRY_RUN !== 'false';

if (!SUPABASE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
    process.exit(1);
}

if (!GOOGLE_MAPS_API_KEY) {
    console.error('❌ GOOGLE_MAPS_API_KEY is required');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function findPlaceId(name: string, city: string, address: string) {
    const query = `${name} ${address} ${city}`.trim();
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json`;
    
    try {
        const response = await axios.get(url, {
            params: {
                input: query,
                inputtype: 'textquery',
                fields: 'place_id,name,formatted_address',
                key: GOOGLE_MAPS_API_KEY
            }
        });

        if (response.data.status === 'OK' && response.data.candidates.length > 0) {
            return response.data.candidates[0].place_id;
        } else {
            console.log(`   ⚠️ No match for: ${query} (Status: ${response.data.status})`);
            return null;
        }
    } catch (error: any) {
        console.error(`   ❌ Error searching for ${query}:`, error.message);
        return null;
    }
}

async function main() {
    console.log(`\n╔══════════════════════════════════════════════════════╗`);
    console.log(`║  Restaurant Place ID Backfill                        ║`);
    console.log(`║  Mode: ${DRY_RUN ? 'DRY RUN — no writes' : 'LIVE    — writing to DB'}          ║`);
    console.log(`╚══════════════════════════════════════════════════════╝\n`);

    const { data: restaurants, error } = await supabase
        .from('restaurants')
        .select('id, name, city, address, maps_place_id')
        .is('maps_place_id', null);

    if (error) {
        console.error('❌ Failed to fetch restaurants:', error.message);
        process.exit(1);
    }

    if (!restaurants || restaurants.length === 0) {
        console.log('✅ All restaurants already have maps_place_id.');
        return;
    }

    console.log(`📋 Found ${restaurants.length} restaurant(s) missing Place ID\n`);

    let updated = 0;
    let failed = 0;

    for (const r of restaurants) {
        console.log(`🔍 Searching for: ${r.name} (${r.city})`);
        const placeId = await findPlaceId(r.name, r.city || '', r.address || '');

        if (placeId) {
            console.log(`   ✅ Found ID: ${placeId}`);
            
            if (!DRY_RUN) {
                const { error: updateError } = await supabase
                    .from('restaurants')
                    .update({ maps_place_id: placeId })
                    .eq('id', r.id);

                if (updateError) {
                    console.error(`   ❌ Update failed: ${updateError.message}`);
                    failed++;
                } else {
                    updated++;
                }
            } else {
                updated++;
            }
        } else {
            failed++;
        }
        
        // Small delay to be nice to the API
        await new Uint8Array(1); // Wait a tiny bit (not really needed for small batches but good practice)
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Processed: ${restaurants.length}`);
    console.log(`   Successful: ${updated}`);
    console.log(`   Failed: ${failed}`);
    
    if (DRY_RUN) {
        console.log(`\n⚠️  DRY RUN — re-run with DRY_RUN=false to apply.\n`);
    }
}

main().catch(console.error);
