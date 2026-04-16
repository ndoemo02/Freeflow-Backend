/**
 * ToolValidator — args validation before ToolRouter.
 * Runs BEFORE ICM/FSM/whitelist. Never touches business logic.
 */
import { getToolSchema } from './ToolSchemas.js';

const QUANTITY_MAX = 99;
const ITEMS_MAX = 20;

const STRING_LIMITS = {
    dish:            { minLen: 1, maxLen: 200 },
    from_dish:       { minLen: 1, maxLen: 200 },
    to_dish:         { minLen: 1, maxLen: 200 },
    location:        { maxLen: 200 },
    cuisine:         { maxLen: 100 },
    restaurant_name: { maxLen: 200 },
    restaurant_id:   { maxLen: 64 },
    selection_text:  { maxLen: 300 },
};

function coerceString(val, key) {
    if (val == null) return null;
    const s = String(val).trim();
    const limits = STRING_LIMITS[key] || {};
    if (limits.minLen && s.length < limits.minLen) return null;
    return s.slice(0, limits.maxLen || 500);
}

function coerceQuantity(val) {
    const n = Math.floor(Number(val));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, QUANTITY_MAX);
}

/**
 * @returns {{ valid: true, sanitized: object } | { valid: false, error: string, field?: string }}
 */
export function validateAndSanitize(toolName, rawArgs) {
    const schema = getToolSchema(toolName);
    if (!schema) return { valid: false, error: 'unknown_tool', field: 'tool' };

    const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
    const required = schema.parameters?.required || [];
    const properties = schema.parameters?.properties || {};
    const sanitized = {};

    // required fields
    for (const field of required) {
        const val = args[field];
        if (val == null || val === '') {
            return { valid: false, error: 'missing_required_field', field };
        }
    }

    // per-property sanitization
    for (const [key, propSchema] of Object.entries(properties)) {
        const val = args[key];
        if (val == null) continue;

        if (key === 'quantity') {
            sanitized[key] = coerceQuantity(val);
            continue;
        }

        if (key === 'lat' || key === 'lng') {
            const n = Number(val);
            if (!Number.isFinite(n)) continue;
            if (key === 'lat' && (n < -90 || n > 90)) continue;
            if (key === 'lng' && (n < -180 || n > 180)) continue;
            sanitized[key] = n;
            continue;
        }

        if (key === 'items') {
            if (!Array.isArray(val)) {
                return { valid: false, error: 'invalid_type', field: 'items' };
            }
            if (val.length === 0) {
                return { valid: false, error: 'missing_required_field', field: 'items' };
            }
            if (val.length > ITEMS_MAX) {
                return { valid: false, error: 'items_too_many', field: 'items', max: ITEMS_MAX };
            }
            const sanitizedItems = [];
            for (let i = 0; i < val.length; i++) {
                const item = val[i];
                if (!item?.dish || typeof item.dish !== 'string' || !item.dish.trim()) {
                    return { valid: false, error: 'missing_required_field', field: `items[${i}].dish` };
                }
                sanitizedItems.push({
                    dish: item.dish.trim().slice(0, 200),
                    quantity: coerceQuantity(item.quantity || 1),
                });
            }
            sanitized[key] = sanitizedItems;
            continue;
        }

        if (propSchema.type === 'string') {
            const coerced = coerceString(val, key);
            if (coerced == null) {
                if (required.includes(key)) {
                    return { valid: false, error: 'invalid_value', field: key };
                }
                continue;
            }
            sanitized[key] = coerced;
            continue;
        }

        if (propSchema.type === 'number') {
            const n = Number(val);
            if (Number.isFinite(n)) sanitized[key] = n;
            continue;
        }
    }

    return { valid: true, sanitized };
}
