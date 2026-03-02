import { Router, Response } from 'express';
import dbModule, { getOne, getAll } from '../database';
import { AuthRequest, authenticateToken, requireRole } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

router.use(authenticateToken, requireRole('admin'));

// Multer config for question images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', '..', 'public', 'uploads', 'questions');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'q-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// POST /api/admin/questions/upload
router.post('/questions/upload', upload.single('file'), (req: AuthRequest, res: Response) => {
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
    }
    const filePath = `/uploads/questions/${req.file.filename}`;
    res.json({ message: 'File uploaded successfully', file_path: filePath });
});

// GET /api/admin/dashboard
router.get('/dashboard', (req: AuthRequest, res: Response) => {
    try {
        const totalStudents = getOne("SELECT COUNT(*) as count FROM users WHERE role = 'student'")?.count || 0;
        const totalQuestions = getOne('SELECT COUNT(*) as count FROM questions')?.count || 0;
        const totalCategories = getOne('SELECT COUNT(*) as count FROM categories')?.count || 0;
        const totalAttempts = getOne('SELECT COUNT(*) as count FROM quiz_attempts WHERE completed_at IS NOT NULL')?.count || 0;
        const totalMeetings = getOne('SELECT COUNT(*) as count FROM live_sessions')?.count || 0;

        const avgScore = getOne(`
      SELECT ROUND(AVG(CAST(score AS FLOAT) / total_questions * 100), 1) as avg_score
      FROM quiz_attempts WHERE completed_at IS NOT NULL
    `);

        const recentAttempts = getAll(`
      SELECT qa.id, u.full_name, u.username, c.name as category, qa.score, qa.total_questions,
             ROUND(CAST(qa.score AS FLOAT) / qa.total_questions * 100, 1) as percentage,
             qa.completed_at
      FROM quiz_attempts qa
      JOIN users u ON qa.student_id = u.id
      JOIN categories c ON qa.category_id = c.id
      WHERE qa.completed_at IS NOT NULL
      ORDER BY qa.completed_at DESC LIMIT 10
    `);

        const recentRegistrations = getAll(`
            SELECT id, full_name, username, email, created_at
            FROM users WHERE role = 'student'
            ORDER BY created_at DESC LIMIT 5
        `);

        const categoryStats = getAll(`
            SELECT c.id, c.name, c.icon, COUNT(q.id) as question_count
            FROM categories c
            LEFT JOIN questions q ON c.id = q.category_id
            GROUP BY c.id
        `);

        res.json({
            stats: {
                totalStudents,
                totalQuestions,
                totalCategories,
                totalAttempts,
                totalMeetings,
                avgScore: avgScore?.avg_score || 0
            },
            recentAttempts,
            recentRegistrations,
            categoryStats
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// GET /api/admin/categories
router.get('/categories', (req: AuthRequest, res: Response) => {
    try {
        const categories = getAll(`
      SELECT c.*, COUNT(q.id) as question_count
      FROM categories c
      LEFT JOIN questions q ON c.id = q.category_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
        res.json({ categories });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// POST /api/admin/categories
router.post('/categories', (req: AuthRequest, res: Response) => {
    try {
        const { name, description, icon, time_limit, access_type } = req.body;
        if (!name) { res.status(400).json({ error: 'Category name is required' }); return; }
        const db = dbModule.getDb();
        db.run(
            'INSERT INTO categories (name, description, icon, time_limit, access_type, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [name, description || '', icon || '📚', time_limit || 0, access_type || 'lifetime', req.user!.id]
        );
        const lastId = (db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]) as number;
        // Notify students
        db.run('INSERT INTO notifications (recipient_role, message, type, target_url) VALUES (?, ?, ?, ?)',
            ['student', `New quiz category added: ${name}`, 'category', 'quiz']);
        dbModule.saveDatabase();
        res.status(201).json({ message: 'Category created', id: lastId });
    } catch (err: any) {
        if (err.message?.includes('UNIQUE')) {
            res.status(409).json({ error: 'Category already exists' });
        } else {
            res.status(500).json({ error: 'Failed to create category' });
        }
    }
});

// PUT /api/admin/categories/:id
router.put('/categories/:id', (req: AuthRequest, res: Response) => {
    try {
        const { name, description, icon, time_limit, access_type } = req.body;
        const db = dbModule.getDb();
        db.run(
            'UPDATE categories SET name = ?, description = ?, icon = ?, time_limit = ?, access_type = ? WHERE id = ?',
            [name, description, icon, time_limit || 0, access_type || 'lifetime', parseInt(req.params.id as string)]
        );
        dbModule.saveDatabase();
        res.json({ message: 'Category updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update category' });
    }
});

// DELETE /api/admin/categories/:id
router.delete('/categories/:id', (req: AuthRequest, res: Response) => {
    try {
        const db = dbModule.getDb();
        db.run('DELETE FROM categories WHERE id = ?', [parseInt(req.params.id as string)]);
        dbModule.saveDatabase();
        res.json({ message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

// GET /api/admin/questions
router.get('/questions', (req: AuthRequest, res: Response) => {
    try {
        const { category_id } = req.query;
        let sql = `
            SELECT q.*, c.name as category_name, q.subtopic_name
            FROM questions q 
            JOIN categories c ON q.category_id = c.id
        `;
        const params: any[] = [];
        if (category_id) { sql += ' WHERE q.category_id = ?'; params.push(parseInt(category_id as string)); }
        sql += ' ORDER BY q.created_at DESC';
        const questions = getAll(sql, params);
        res.json({ questions });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

// POST /api/admin/questions
router.post('/questions', (req: AuthRequest, res: Response) => {
    try {
        const { category_id, subtopic_name, question_text, question_description, option_a, option_b, option_c, option_d, correct_answer, difficulty, time_limit, question_image } = req.body;
        if (!category_id || (!question_text && !question_image) || !option_a || !option_b || !option_c || !option_d || !correct_answer) {
            res.status(400).json({ error: 'All fields are required' }); return;
        }
        const db = dbModule.getDb();
        db.run(`
      INSERT INTO questions (category_id, subtopic_name, question_text, question_description, option_a, option_b, option_c, option_d, correct_answer, difficulty, time_limit, question_image, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [category_id, subtopic_name || '', question_text || '', question_description || '', option_a, option_b, option_c, option_d, correct_answer, difficulty || 'medium', time_limit || 0, question_image || '', req.user!.id]);
        const lastId = (db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]) as number;
        // Notify students
        db.run('INSERT INTO notifications (recipient_role, message, type, target_url) VALUES (?, ?, ?, ?)',
            ['student', `New questions added to the platform!`, 'question', 'quiz']);
        dbModule.saveDatabase();
        res.status(201).json({ message: 'Question created', id: lastId });
    } catch (err) {
        console.error('Create question error:', err);
        res.status(500).json({ error: 'Failed to create question' });
    }
});

// PUT /api/admin/questions/:id
router.put('/questions/:id', (req: AuthRequest, res: Response) => {
    try {
        const { question_text, question_description, option_a, option_b, option_c, option_d, correct_answer, difficulty, category_id, subtopic_name, time_limit, question_image } = req.body;
        if (!category_id || (!question_text && !question_image) || !option_a || !option_b || !option_c || !option_d || !correct_answer) {
            res.status(400).json({ error: 'All fields are required' }); return;
        }
        const db = dbModule.getDb();
        db.run(`
      UPDATE questions 
      SET category_id = ?, subtopic_name = ?, question_text = ?, question_description = ?, 
          option_a = ?, option_b = ?, option_c = ?, option_d = ?, 
          correct_answer = ?, difficulty = ?, time_limit = ?, question_image = ?
      WHERE id = ?
    `, [category_id, subtopic_name || '', question_text || '', question_description || '', option_a, option_b, option_c, option_d, correct_answer, difficulty || 'medium', time_limit || 0, question_image || '', parseInt(req.params.id as string)]);
        dbModule.saveDatabase();
        res.json({ message: 'Question updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update question' });
    }
});

// DELETE /api/admin/questions/all  <-- MUST be BEFORE /:id to avoid route conflict
router.delete('/questions/all', (req: AuthRequest, res: Response) => {
    try {
        const db = dbModule.getDb();
        db.run('DELETE FROM attempt_answers');
        db.run('DELETE FROM questions');
        dbModule.saveDatabase();
        console.log('[Admin] All questions cleared by:', req.user!.username);
        res.json({ message: 'All questions cleared successfully' });
    } catch (err) {
        console.error('Clear questions error:', err);
        res.status(500).json({ error: 'Failed to clear questions' });
    }
});

// DELETE /api/admin/questions/:id  <-- MUST be AFTER /all
router.delete('/questions/:id', (req: AuthRequest, res: Response) => {
    try {
        const db = dbModule.getDb();
        db.run('DELETE FROM questions WHERE id = ?', [parseInt(req.params.id as string)]);
        dbModule.saveDatabase();
        res.json({ message: 'Question deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete question' });
    }
});

// GET /api/admin/students
router.get('/students', (req: AuthRequest, res: Response) => {
    try {
        const students = getAll(`
      SELECT u.id, u.username, u.email, u.full_name, u.created_at,
             COUNT(DISTINCT qa.id) as total_attempts,
             ROUND(AVG(CASE WHEN qa.completed_at IS NOT NULL THEN CAST(qa.score AS FLOAT) / qa.total_questions * 100 END), 1) as avg_score
      FROM users u
      LEFT JOIN quiz_attempts qa ON u.id = qa.student_id
      WHERE u.role = 'student'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
        res.json({ students });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});

// DELETE /api/admin/students/:id
router.delete('/students/:id', (req: AuthRequest, res: Response) => {
    try {
        const studentId = parseInt(req.params.id as string);
        const db = dbModule.getDb();

        db.run('DELETE FROM attempt_answers WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE student_id = ?)', [studentId]);
        db.run('DELETE FROM quiz_attempts WHERE student_id = ?', [studentId]);
        db.run('DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?', [studentId, studentId]);
        db.run('DELETE FROM notifications WHERE recipient_id = ?', [studentId]);
        db.run('DELETE FROM users WHERE id = ? AND role = "student"', [studentId]);

        dbModule.saveDatabase();
        res.json({ message: 'Student and related data deleted successfully' });
    } catch (err) {
        console.error('Delete student error:', err);
        res.status(500).json({ error: 'Failed to delete student' });
    }
});

// GET /api/admin/leaderboard -- Admin-accessible leaderboard (avoids student-role restriction)
router.get('/leaderboard', (req: AuthRequest, res: Response) => {
    try {
        const leaderboard = getAll(`
      SELECT u.full_name, u.username,
             COUNT(qa.id) as total_quizzes,
             ROUND(AVG(CAST(qa.score AS FLOAT) / qa.total_questions * 100), 1) as avg_score,
             SUM(qa.score) as total_score
      FROM users u
      JOIN quiz_attempts qa ON u.id = qa.student_id
      WHERE u.role = 'student' AND qa.completed_at IS NOT NULL
      GROUP BY u.id
      ORDER BY avg_score DESC, total_score DESC
      LIMIT 20
    `);
        res.json({ leaderboard });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

// ── SUBTOPICS ──

// GET /api/admin/subtopics?category_id=X
router.get('/subtopics', (req: AuthRequest, res: Response) => {
    try {
        const categoryId = req.query.category_id;
        let subtopics;
        if (categoryId) {
            subtopics = getAll('SELECT s.*, c.name as category_name FROM subtopics s JOIN categories c ON s.category_id = c.id WHERE s.category_id = ? ORDER BY s.name', [parseInt(categoryId as string)]);
        } else {
            subtopics = getAll('SELECT s.*, c.name as category_name FROM subtopics s JOIN categories c ON s.category_id = c.id ORDER BY c.name, s.name');
        }
        res.json({ subtopics });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch subtopics' });
    }
});

// POST /api/admin/subtopics
router.post('/subtopics', (req: AuthRequest, res: Response) => {
    try {
        const { category_id, name, description, icon } = req.body;
        if (!category_id || !name) {
            res.status(400).json({ error: 'Category and name are required' });
            return;
        }
        const db = dbModule.getDb();
        db.run('INSERT INTO subtopics (category_id, name, description, icon) VALUES (?, ?, ?, ?)',
            [category_id, name, description || '', icon || '📌']);
        dbModule.saveDatabase();
        res.json({ message: 'Subtopic created' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create subtopic' });
    }
});

// PUT /api/admin/subtopics/:id
router.put('/subtopics/:id', (req: AuthRequest, res: Response) => {
    try {
        const { name, description, icon } = req.body;
        const db = dbModule.getDb();
        db.run('UPDATE subtopics SET name = ?, description = ?, icon = ? WHERE id = ?',
            [name, description || '', icon || '📌', parseInt(req.params.id as string)]);
        dbModule.saveDatabase();
        res.json({ message: 'Subtopic updated' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update subtopic' });
    }
});

// DELETE /api/admin/subtopics/:id
router.delete('/subtopics/:id', (req: AuthRequest, res: Response) => {
    try {
        const db = dbModule.getDb();
        db.run('DELETE FROM subtopics WHERE id = ?', [parseInt(req.params.id as string)]);
        dbModule.saveDatabase();
        res.json({ message: 'Subtopic deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete subtopic' });
    }
});

// GET /api/admin/submissions
router.get('/submissions', (req: AuthRequest, res: Response) => {
    try {
        const submissions = getAll(`
            SELECT 
                u.full_name as student_name,
                c.name as category_name,
                q.question_text,
                aa.uploaded_file as file_path,
                qa.completed_at
            FROM attempt_answers aa
            JOIN quiz_attempts qa ON aa.attempt_id = qa.id
            JOIN users u ON qa.student_id = u.id
            JOIN categories c ON qa.category_id = c.id
            JOIN questions q ON aa.question_id = q.id
            WHERE aa.uploaded_file IS NOT NULL AND aa.uploaded_file != ''
            ORDER BY qa.completed_at DESC
        `);

        res.json({ submissions });
    } catch (err) {
        console.error('Submissions error:', err);
        res.status(500).json({ error: 'Failed to load submissions' });
    }
});

// GET /api/admin/students/:id/activity
router.get('/students/:id/activity', (req: AuthRequest, res: Response) => {
    try {
        const studentId = parseInt(req.params.id as string);
        const attempts = getAll(`
            SELECT qa.id, c.name as category, qa.score, qa.total_questions, qa.completed_at
            FROM quiz_attempts qa
            JOIN categories c ON qa.category_id = c.id
            WHERE qa.student_id = ? AND qa.completed_at IS NOT NULL
            ORDER BY qa.completed_at DESC LIMIT 5
        `, [studentId]);
        res.json({ attempts });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// POST /api/admin/reset-all (DANGER: Wipes everything except admins)
router.post('/reset-all', (req: AuthRequest, res: Response) => {
    try {
        const db = dbModule.getDb();

        // 1. Wipe all quiz related data
        db.run('DELETE FROM attempt_answers');
        db.run('DELETE FROM quiz_attempts');
        db.run('DELETE FROM questions');
        db.run('DELETE FROM subtopics');
        db.run('DELETE FROM categories');

        // 2. Wipe communications
        db.run('DELETE FROM messages');
        db.run('DELETE FROM notifications');
        db.run('DELETE FROM live_sessions');

        // 3. Wipe all students (keep admins)
        db.run("DELETE FROM users WHERE role = 'student'");

        dbModule.saveDatabase();
        res.json({ message: 'System reset successful. All student data and content cleared.' });
    } catch (err) {
        console.error('Reset all error:', err);
        res.status(500).json({ error: 'Failed to reset system' });
    }
});

// POST /api/admin/broadcast
router.post('/broadcast', (req: AuthRequest, res: Response) => {
    try {
        const { message_text } = req.body;
        const db = dbModule.getDb();
        const user = req.user!;

        db.run(`
            INSERT INTO messages (sender_id, sender_role, sender_name, recipient_id, message_text, is_broadcast)
            VALUES (?, ?, ?, NULL, ?, 1)
        `, [user.id, user.role, user.full_name, message_text]);

        dbModule.saveDatabase();
        res.json({ message: 'Broadcast sent' });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

export default router;
