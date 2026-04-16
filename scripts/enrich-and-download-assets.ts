/**
 * enrich-and-download-assets.ts
 * ─────────────────────────────────────────────────────────────
 * 1. Fetches details for restaurants with maps_place_id.
 * 2. Downloads the primary photo to frontend/public/images/restaurants/.
 * 3. Updates Supabase with maps_rating, phone, website, opening_hours, and image_url.
 *
 * Usage:
 *   DRY_RUN=true npx ts-node scripts/enrich-and-download-assets.ts
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ezemaacyyvbpjlagchds.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const DRY_RUN = process.env.DRY_RUN !== 'false';
const IMAGE_DIR = path.resolve(__dirname, '../../frontend/public/images/restaurants');

if (!SUPABASE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
    process.exit(1);
}

if (!GOOGLE_MAPS_API_KEY) {
    console.error('❌ GOOGLE_MAPS_API_KEY is required');
    process.exit(1);
}

// Ensure image directory exists
if (!DRY_RUN && !fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function downloadPhoto(photoReference: string, restaurantId: string, index: number = 0) {
    const url = `https://maps.googleapis.com/maps/api/place/photo`;
    const fileName = index === 0 ? `${restaurantId}.jpg` : `${restaurantId}_${index}.jpg`;
    const filePath = path.join(IMAGE_DIR, fileName);
    const publicPath = `/images/restaurants/${fileName}`;

    try {
        const response = await axios.get(url, {
            params: {
                maxwidth: 800,
                photoreference: photoReference,
                key: GOOGLE_MAPS_API_KEY
            },
            responseType: 'arraybuffer'
        });

        if (!DRY_RUN) {
            fs.writeFileSync(filePath, response.data);
            console.log(`   ✅ Photo ${index} saved to: ${publicPath}`);
        } else {
            console.log(`   📸 [DRY RUN] Would save photo ${index} to: ${publicPath}`);
        }

        return publicPath;
    } catch (error: any) {
        console.error(`   ❌ Failed to download photo ${index} for ${restaurantId}:`, error.message);
        return null;
    }
}

async function getPlaceDetails(placeId: string) {
    const url = `https://maps.googleapis.com/maps/api/place/details/json`;
    
    try {
        const response = await axios.get(url, {
            params: {
                place_id: placeId,
                fields: 'rating,user_ratings_total,formatted_phone_number,website,opening_hours,url,photo',
                key: GOOGLE_MAPS_API_KEY
            }
        });

        if (response.data.status === 'OK') {
            return response.data.result;
        } else {
            console.log(`   ⚠️ Details status: ${response.data.status}`);
            return null;
        }
    } catch (error: any) {
        console.error(`   ❌ Error fetching details for ${placeId}:`, error.message);
        return null;
    }
}

async function main() {
    console.log(`\n╔══════════════════════════════════════════════════════╗`);
    console.log(`║  Restaurant Metadata & Asset Enrichment              ║`);
    console.log(`║  Mode: ${DRY_RUN ? 'DRY RUN — no writes' : 'LIVE    — writing to DB'}          ║`);
    console.log(`╚══════════════════════════════════════════════════════╝\n`);

    const { data: restaurants, error } = await supabase
        .from('restaurants')
        .select('id, name, maps_place_id')
        .not('maps_place_id', 'is', null);

    if (error) {
        console.error('❌ Failed to fetch restaurants:', error.message);
        process.exit(1);
    }

    if (!restaurants || restaurants.length === 0) {
        console.log('⚠️ No restaurants with Place IDs found.');
        return;
    }

    console.log(`📋 Found ${restaurants.length} restaurant(s) to enrich\n`);

    for (const r of restaurants) {
        console.log(`🏢 Processing: ${r.name}`);
        const details = await getPlaceDetails(r.maps_place_id);

        if (details) {
            const updates: any = {
                maps_rating: details.rating || null,
                maps_ratings_total: details.user_ratings_total || null,
                phone: details.formatted_phone_number || null,
                website: details.website || null,
                opening_hours: details.opening_hours || null,
                maps_url: details.url || null
            };

            // Download photos gallery if available
            if (details.photos && details.photos.length > 0) {
                const galleryLimit = 5;
                const galleryPaths: string[] = [];
                
                for (let i = 0; i < Math.min(details.photos.length, galleryLimit); i++) {
                    const photoRef = details.photos[i].photo_reference;
                    const localPath = await downloadPhoto(photoRef, r.id, i);
                    if (localPath) {
                        galleryPaths.push(localPath);
                    }
                }

                if (galleryPaths.length > 0) {
                    updates.image_url = galleryPaths[0]; // Primary
                    updates.photo_gallery = galleryPaths; // All
                }
            }

            if (!DRY_RUN) {
                const { error: updateError } = await supabase
                    .from('restaurants')
                    .update(updates)
                    .eq('id', r.id);

                if (updateError) {
                    console.error(`   ❌ Update failed: ${updateError.message}`);
                } else {
                    console.log(`   ✅ Metadata & Photo updated in DB`);
                }
            } else {
                console.log(`   ✅ [DRY RUN] Would update DB with:`, JSON.stringify(updates, null, 2));
            }
        }
        console.log('');
    }

    console.log(`\n📊 Enrichment complete.`);
    if (DRY_RUN) {
        console.log(`⚠️  DRY RUN — re-run with DRY_RUN=false to apply.\n`);
    }
}

main().catch(console.error);
