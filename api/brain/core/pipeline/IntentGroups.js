export const ORDER_INTENTS = [
    'create_order',
    'confirm_add_to_cart',
    'open_checkout',
    'remove_from_cart',
    'confirm_order',
    'cancel_order'
];

export const TRANSACTION_ALLOWED_INTENTS = [
    'create_order',
    'confirm_add_to_cart',
    'open_checkout',
    'remove_from_cart',
    'confirm_order',
    'cancel_order'
];

export const ORDER_INTENTS_CLEANUP = [
    'create_order',
    'confirm_add_to_cart',
    'open_checkout',
    'remove_from_cart',
    'confirm_order',
    'cancel_order'
];

export const ESCAPE_INTENTS = [
    'select_restaurant',
    'find_nearby',
    'show_menu',
    'cancel_order',
    'cancel'
];

export const CONFIDENT_SOURCES = [
    'dish_guard',
    'rule_guard',
    'context_override',
    'expected_context_override',
    'transaction_lock_override',
    'discovery_guard_block',
    'catalog_match_explicit',
    'explicit_menu_override'
];

export const EXPLICIT_ESCAPE_SOURCES = [
    'discovery_override',
    'lock_escape',
    'explicit_more_options',
    'regex_v2',
    'catalog_match_explicit'
];

export const CART_MUTATION_WHITELIST = [
    'confirm_order',
    'confirm_add_to_cart',
    'remove_from_cart'
];

export const CONFIRMATION_CONTEXTS = [
    'confirm_order',
    'confirm_add_to_cart'
];
