export const LIVE_TOOL_SCHEMAS = Object.freeze([
    {
        name: 'find_nearby',
        description: 'Find nearby restaurants using optional location and cuisine filters.',
        parameters: {
            type: 'object',
            properties: {
                location: { type: 'string' },
                cuisine: { type: 'string' },
                lat: { type: 'number' },
                lng: { type: 'number' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'select_restaurant',
        description: 'Select restaurant from list or direct id.',
        parameters: {
            type: 'object',
            properties: {
                restaurant_id: { type: 'string' },
                restaurant_name: { type: 'string' },
                selection_text: { type: 'string' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'show_menu',
        description: 'Show menu for selected restaurant. Can be called repeatedly for multiple restaurants to build comparisons.',
        parameters: {
            type: 'object',
            properties: {
                restaurant_id: { type: 'string' },
                restaurant_name: { type: 'string' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'show_more_options',
        description: 'Paginate or show more options from current restaurant list.',
        parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'compare_restaurants',
        description: 'Compare menu items across up to 3 restaurants in the same city. Read-only.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string' },
                category: { type: 'string' },
                city: { type: 'string' },
                metric: { type: 'string' },
                max_restaurants: { type: 'number' },
                max_items_per_restaurant: { type: 'number' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'add_item_to_cart',
        description: 'Add one item to cart by dish name and quantity. Use special_instructions when user requests modifications (remove ingredients, add extras, leave a note like "mocno wysmażone").',
        parameters: {
            type: 'object',
            properties: {
                dish: { type: 'string' },
                quantity: { type: 'number' },
                restaurant_id: { type: 'string' },
                restaurant_name: { type: 'string' },
                special_instructions: {
                    type: 'object',
                    properties: {
                        removed: { type: 'array', items: { type: 'string' } },
                        extra: { type: 'array', items: { type: 'string' } },
                        note: { type: 'string' },
                    },
                },
            },
            required: ['dish'],
            additionalProperties: false,
        },
    },
    {
        name: 'add_items_to_cart',
        description: 'Add multiple items to cart in one transaction. Each item can have special_instructions for modifications.',
        parameters: {
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            dish: { type: 'string' },
                            quantity: { type: 'number' },
                            special_instructions: {
                                type: 'object',
                                properties: {
                                    removed: { type: 'array', items: { type: 'string' } },
                                    extra: { type: 'array', items: { type: 'string' } },
                                    note: { type: 'string' },
                                },
                            },
                        },
                        required: ['dish'],
                        additionalProperties: false,
                    },
                },
                restaurant_id: { type: 'string' },
                restaurant_name: { type: 'string' },
            },
            required: ['items'],
            additionalProperties: false,
        },
    },
    {
        name: 'update_cart_item_quantity',
        description: 'Change quantity for an existing cart item by dish name.',
        parameters: {
            type: 'object',
            properties: {
                dish: { type: 'string' },
                quantity: { type: 'number' },
            },
            required: ['dish', 'quantity'],
            additionalProperties: false,
        },
    },
    {
        name: 'remove_item_from_cart',
        description: 'Remove item from cart by dish name. Optional quantity removes only part of amount.',
        parameters: {
            type: 'object',
            properties: {
                dish: { type: 'string' },
                quantity: { type: 'number' },
            },
            required: ['dish'],
            additionalProperties: false,
        },
    },
    {
        name: 'replace_cart_item',
        description: 'Replace one cart item with another dish in the same restaurant scope.',
        parameters: {
            type: 'object',
            properties: {
                from_dish: { type: 'string' },
                to_dish: { type: 'string' },
                quantity: { type: 'number' },
                restaurant_id: { type: 'string' },
                restaurant_name: { type: 'string' },
            },
            required: ['from_dish', 'to_dish'],
            additionalProperties: false,
        },
    },
    {
        name: 'confirm_add_to_cart',
        description: 'Confirm pending add-to-cart operation.',
        parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'open_checkout',
        description: 'Open checkout flow for current cart.',
        parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'confirm_order',
        description: 'Confirm and finalize current order flow.',
        parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'cancel_order',
        description: 'Cancel current order flow and reset ordering state.',
        parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'get_cart_state',
        description: 'Read current server-side cart/session state.',
        parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
]);

export function getToolSchema(toolName) {
    return LIVE_TOOL_SCHEMAS.find((tool) => tool.name === toolName) || null;
}

export function toGeminiFunctionDeclarations() {
    return LIVE_TOOL_SCHEMAS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
    }));
}

