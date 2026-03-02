import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import dbModule, { getOne, getAll } from '../database';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();

// File upload config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', '..', 'public', 'uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'msg-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx', '.txt', '.ppt', '.pptx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.gif', '.zip'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('File type not allowed'));
        }
    }
});

// All message routes need auth
router.use(authenticateToken);

// ── Send message (admin broadcast or student reply) ──
router.post('/', upload.single('file'), (req: AuthRequest, res: Response) => {
    try {
        const { message_text, recipient_id } = req.body;
        const file = req.file;

        if (!message_text && !file) {
            res.status(400).json({ error: 'Message text or file is required' });
            return;
        }

        const db = dbModule.getDb();
        const isAdmin = req.user!.role === 'admin';
        const isBroadcast = isAdmin && (!recipient_id || recipient_id === 'all');

        // Get sender name
        const sender = getOne('SELECT full_name FROM users WHERE id = ?', [req.user!.id]);

        db.run(
            `INSERT INTO messages (sender_id, sender_role, sender_name, recipient_id, message_text, file_path, file_name, is_broadcast)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user!.id,
                req.user!.role,
                sender?.full_name || req.user!.username,
                isBroadcast ? null : (recipient_id ? parseInt(recipient_id) : null),
                message_text || '',
                file ? '/uploads/' + file.filename : '',
                file ? file.originalname : '',
                isBroadcast ? 1 : 0
            ]
        );

        const lastId = (db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]) as number;

        // Notify
        if (isBroadcast) {
            db.run('INSERT INTO notifications (recipient_role, message, type, target_url) VALUES (?, ?, ?, ?)',
                ['student', `New announcement from ${sender?.full_name || 'Admin'}`, file ? 'file' : 'message', 'messages']);
        } else if (recipient_id && isAdmin) {
            db.run('INSERT INTO notifications (recipient_role, recipient_id, message, type, target_url) VALUES (?, ?, ?, ?, ?)',
                ['student', parseInt(recipient_id), `New message from ${sender?.full_name || 'Admin'}`, file ? 'file' : 'message', 'messages']);
        } else if (!isAdmin) {
            db.run('INSERT INTO notifications (recipient_role, message, type, target_url) VALUES (?, ?, ?, ?)',
                ['admin', `New message from ${sender?.full_name || 'Student'}`, file ? 'file' : 'message', 'messages']);
        }

        dbModule.saveDatabase();

        res.status(201).json({
            message: 'Message sent',
            id: lastId,
            data: {
                id: lastId,
                sender_name: sender?.full_name || req.user!.username,
                sender_role: req.user!.role,
                message_text: message_text || '',
                file_path: file ? '/uploads/' + file.filename : '',
                file_name: file ? file.originalname : '',
                is_broadcast: isBroadcast ? 1 : 0
            }
        });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// ── Get messages (for current user) ──
router.get('/', (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const role = req.user!.role;

        let messages;
        if (role === 'admin') {
            // Admin sees all messages
            messages = getAll(`
        SELECT m.*, u.full_name as display_name
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        ORDER BY m.created_at DESC
        LIMIT 100
      `);
        } else {
            // Student sees broadcasts + their own messages + messages addressed to them
            messages = getAll(`
        SELECT m.*, u.full_name as display_name
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.is_broadcast = 1
           OR m.sender_id = ?
           OR m.recipient_id = ?
        ORDER BY m.created_at DESC
        LIMIT 100
      `, [userId, userId]);
        }

        res.json({ messages });
    } catch (err) {
        console.error('Get messages error:', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// ── Delete message (admin only) ──
router.delete('/:id', (req: AuthRequest, res: Response) => {
    try {
        if (req.user!.role !== 'admin') {
            res.status(403).json({ error: 'Only admin can delete messages' });
            return;
        }
        const db = dbModule.getDb();
        const msgId = parseInt(req.params.id as string);
        db.run('DELETE FROM messages WHERE id = ?', [msgId]);
        dbModule.saveDatabase();
        res.json({ message: 'Message deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

export default router;
