import { Router, Response } from 'express';
import dbModule, { getAll } from '../database';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// Get unread notifications for the current user
router.get('/', (req: AuthRequest, res: Response) => {
    try {
        const role = req.user!.role;
        const userId = req.user!.id;

        // Get notifications aimed at their role OR specifically to their ID
        const notifications = getAll(`
            SELECT * FROM notifications 
            WHERE (recipient_role = ? OR recipient_id = ?) 
              AND is_read = 0 
            ORDER BY created_at ASC
        `, [role, userId]);

        res.json({ notifications });
    } catch (err) {
        console.error('Failed to get notifications:', err);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark all notifications as read for the user
router.post('/read-all', (req: AuthRequest, res: Response) => {
    try {
        const role = req.user!.role;
        const userId = req.user!.id;
        const db = dbModule.getDb();

        db.run(`
            UPDATE notifications 
            SET is_read = 1 
            WHERE (recipient_role = ? OR recipient_id = ?) 
              AND is_read = 0
        `, [role, userId]);

        dbModule.saveDatabaseAsync();
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to mark notifications read:', err);
        res.status(500).json({ error: 'Failed to mark notifications read' });
    }
});

export default router;
