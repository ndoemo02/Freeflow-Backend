
import express from 'express';
import { supabase } from '../_supabase.js';
import conversations from './conversations.js';
import conversationsClear from './conversations-clear.js';
import conversation from './conversation.js';
import conversationDelete from './conversation-delete.js';
import stats from './business-stats.js';
import systemStatus from './system-status.js';

const router = express.Router();

// Helper to wrap Vercel-style handlers (req, res) -> Express
const wrap = (handler) => async (req, res, next) => {
    try {
        await handler(req, res);
    } catch (err) {
        next(err);
    }
};

router.get('/conversations', wrap(conversations));
router.delete('/conversations', wrap(conversationsClear));
router.get('/conversation', wrap(conversation));
router.delete('/conversation', wrap(conversationDelete));
router.get('/business-stats', wrap(stats));
router.get('/system-status', wrap(systemStatus));

// GET /orders — same query as adminRouter.js; no token gate in local dev
router.get('/orders', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;
        const status = req.query.status;
        const restaurantId = req.query.restaurant_id;

        let query = supabase
            .from('orders')
            .select(
                'id, restaurant_id, restaurant_name, user_id, items, total_price, status, customer_name, customer_phone, delivery_address, notes, created_at',
                { count: 'exact' }
            )
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) query = query.eq('status', status);
        if (restaurantId) query = query.eq('restaurant_id', restaurantId);

        const { data, error, count } = await query;
        if (error) throw error;

        const orders = (data || []).map(o => ({
            id: o.id,
            restaurantId: o.restaurant_id,
            restaurantName: o.restaurant_name,
            userId: o.user_id,
            items: o.items || [],
            totalPrice: o.total_price,
            status: o.status,
            customer: { name: o.customer_name, phone: o.customer_phone, address: o.delivery_address },
            notes: o.notes,
            createdAt: o.created_at,
        }));

        return res.json({ ok: true, data: orders, pagination: { total: count || 0, limit, offset, hasMore: (offset + limit) < (count || 0) } });
    } catch (err) {
        console.error('[router] GET /orders error:', err.message);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

export default router;
