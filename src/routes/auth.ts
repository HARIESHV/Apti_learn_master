import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import dbModule, { getOne } from '../database';
import { AuthRequest, generateToken, authenticateToken } from '../middleware/auth';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req: AuthRequest, res: Response) => {
    try {
        const { username, email, password, full_name } = req.body;
        if (!username || !email || !password || !full_name) {
            res.status(400).json({ error: 'All fields are required' }); return;
        }
        const existing = getOne('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existing) { res.status(409).json({ error: 'Username or email already exists' }); return; }

        const password_hash = await bcrypt.hash(password, 12);
        const db = dbModule.getDb();
        db.run('INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
            [username, email, password_hash, full_name, 'student']);
        const lastId = (db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]) as number;
        console.log(`[Auth] Registered new student: ${username} (ID: ${lastId})`);

        // Notify admin
        db.run('INSERT INTO notifications (recipient_role, message, type, target_url) VALUES (?, ?, ?, ?)',
            ['admin', `New student registered: ${full_name} (@${username})`, 'registration', 'students']);

        dbModule.saveDatabase();
        console.log(`[Auth] Database saved after registration of ${username}`);

        const token = generateToken({ id: lastId, username, role: 'student', full_name });
        res.status(201).json({ message: 'Registration successful', token, user: { id: lastId, username, email, full_name, role: 'student' } });
    } catch (err: any) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', async (req: AuthRequest, res: Response) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            res.status(400).json({ error: 'Username, password and role are required' });
            return;
        }

        const user = getOne('SELECT * FROM users WHERE username = ? AND role = ?', [username, role]);

        if (!user) {
            console.warn(`[Login] Attempt failed: User ${username} not found with role ${role}`);
            res.status(401).json({ error: 'Invalid credentials or role' });
            return;
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            console.warn(`[Login] Attempt failed: Invalid password for ${username}`);
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const token = generateToken({ id: user.id, username: user.username, role: user.role, full_name: user.full_name });

        console.log(`[Login] User ${username} logged in successfully as ${role}`);

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role
            }
        });
    } catch (err: any) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed internal error' });
    }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const user = getOne('SELECT id, username, email, full_name, role, created_at FROM users WHERE id = ?', [req.user!.id]);
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }
        res.json({ user });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

export default router;
