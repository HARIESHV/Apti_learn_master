import { Router, Response } from 'express';
import dbModule, { getOne, getAll } from '../database';
import { AuthRequest, authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// ── Admin: Create live session ──
router.post('/', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const { title, meet_link, description, scheduled_at } = req.body;
        if (!title || !meet_link) {
            res.status(400).json({ error: 'Title and meet link are required' });
            return;
        }
        const db = dbModule.getDb();
        db.run(
            'INSERT INTO live_sessions (title, meet_link, description, scheduled_at, is_active, created_by) VALUES (?, ?, ?, ?, 1, ?)',
            [title, meet_link, description || '', scheduled_at || null, req.user!.id]
        );
        const lastId = (db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]) as number;
        dbModule.saveDatabase();
        res.status(201).json({ message: 'Live session created', id: lastId });
    } catch (err) {
        console.error('Create session error:', err);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// ── Admin: Get all sessions ──
router.get('/admin', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const sessions = getAll('SELECT * FROM live_sessions ORDER BY created_at DESC');
        res.json({ sessions });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

// ── Admin: Toggle session active ──
router.put('/:id/toggle', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const sessionId = parseInt(req.params.id as string);
        const session = getOne('SELECT * FROM live_sessions WHERE id = ?', [sessionId]);
        if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
        const db = dbModule.getDb();
        db.run('UPDATE live_sessions SET is_active = ? WHERE id = ?', [session.is_active ? 0 : 1, sessionId]);
        dbModule.saveDatabase();
        res.json({ message: 'Session toggled', is_active: !session.is_active });
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle session' });
    }
});

// ── Admin: Delete session ──
router.delete('/:id', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const db = dbModule.getDb();
        const sessionId = parseInt(req.params.id as string);
        db.run('DELETE FROM live_sessions WHERE id = ?', [sessionId]);
        dbModule.saveDatabase();
        res.json({ message: 'Session deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

// ── Student: Get active sessions ──
router.get('/active', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const sessions = getAll('SELECT * FROM live_sessions WHERE is_active = 1 ORDER BY created_at DESC');
        res.json({ sessions });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

export default router;
