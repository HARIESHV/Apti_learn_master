import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import dbModule, { getOne, getAll } from '../database';
import { AuthRequest, authenticateToken, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticateToken, requireRole('student'));

// File upload for quiz answers
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', '..', 'public', 'uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'quiz-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/student/dashboard
router.get('/dashboard', (req: AuthRequest, res: Response) => {
    try {
        const studentId = req.user!.id;

        const totalAttempts = getOne(
            'SELECT COUNT(*) as count FROM quiz_attempts WHERE student_id = ? AND completed_at IS NOT NULL', [studentId]
        )?.count || 0;

        const avgScore = getOne(`
      SELECT ROUND(AVG(CAST(score AS FLOAT) / total_questions * 100), 1) as avg_score
      FROM quiz_attempts WHERE student_id = ? AND completed_at IS NOT NULL
    `, [studentId]);

        const bestScore = getOne(`
      SELECT MAX(ROUND(CAST(score AS FLOAT) / total_questions * 100, 1)) as best_score
      FROM quiz_attempts WHERE student_id = ? AND completed_at IS NOT NULL
    `, [studentId]);

        const categoriesAttempted = getOne(`
      SELECT COUNT(DISTINCT category_id) as count FROM quiz_attempts
      WHERE student_id = ? AND completed_at IS NOT NULL
    `, [studentId])?.count || 0;

        const recentAttempts = getAll(`
      SELECT qa.id, c.name as category, c.icon, qa.score, qa.total_questions,
             ROUND(CAST(qa.score AS FLOAT) / qa.total_questions * 100, 1) as percentage,
             qa.completed_at
      FROM quiz_attempts qa
      JOIN categories c ON qa.category_id = c.id
      WHERE qa.student_id = ? AND qa.completed_at IS NOT NULL
      ORDER BY qa.completed_at DESC LIMIT 10
    `, [studentId]);

        const categoryPerformance = getAll(`
      SELECT c.name, c.icon,
             COUNT(qa.id) as attempts,
             ROUND(AVG(CAST(qa.score AS FLOAT) / qa.total_questions * 100), 1) as avg_score,
             MAX(ROUND(CAST(qa.score AS FLOAT) / qa.total_questions * 100, 1)) as best_score
      FROM quiz_attempts qa
      JOIN categories c ON qa.category_id = c.id
      WHERE qa.student_id = ? AND qa.completed_at IS NOT NULL
      GROUP BY c.id
    `, [studentId]);

        res.json({
            stats: {
                totalAttempts,
                avgScore: avgScore?.avg_score || 0,
                bestScore: bestScore?.best_score || 0,
                categoriesAttempted
            },
            recentAttempts,
            categoryPerformance
        });
    } catch (err) {
        console.error('Student dashboard error:', err);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// GET /api/student/categories
router.get('/categories', (req: AuthRequest, res: Response) => {
    try {
        const categories = getAll(`
      SELECT c.id, c.name, c.description, c.icon, c.time_limit, c.access_type,
             COUNT(q.id) as question_count
      FROM categories c
      LEFT JOIN questions q ON c.id = q.category_id
      GROUP BY c.id
      HAVING question_count > 0
      ORDER BY c.name
    `);
        res.json({ categories });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// GET /api/student/subtopics?category_id=X
router.get('/subtopics', (req: AuthRequest, res: Response) => {
    try {
        const categoryId = req.query.category_id;
        if (!categoryId) {
            res.status(400).json({ error: 'category_id is required' });
            return;
        }
        const subtopics = getAll(
            'SELECT id, name, description, icon FROM subtopics WHERE category_id = ? ORDER BY name',
            [parseInt(categoryId as string)]
        );
        res.json({ subtopics });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch subtopics' });
    }
});

// POST /api/student/quiz/start
router.post('/quiz/start', (req: AuthRequest, res: Response) => {
    try {
        const { category_id, num_questions } = req.body;
        const limit = num_questions || 10;

        if (!category_id) {
            res.status(400).json({ error: 'Category is required' });
            return;
        }

        // Get category info for time limit
        const category = getOne('SELECT * FROM categories WHERE id = ?', [category_id]);

        const questions = getAll(`
      SELECT id, question_text, question_description, question_image, option_a, option_b, option_c, option_d, difficulty
      FROM questions WHERE category_id = ?
      ORDER BY RANDOM() LIMIT ?
    `, [category_id, limit]);

        if (questions.length === 0) {
            res.status(404).json({ error: 'No questions available in this category' });
            return;
        }

        const db = dbModule.getDb();
        const timeLimit = category?.time_limit || 0;
        db.run('INSERT INTO quiz_attempts (student_id, category_id, total_questions, time_limit) VALUES (?, ?, ?, ?)',
            [req.user!.id, category_id, questions.length, timeLimit]);

        const lastId = (db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]) as number;
        dbModule.saveDatabase();

        res.json({
            attempt_id: lastId,
            questions,
            total: questions.length,
            time_limit: timeLimit,
            access_type: category?.access_type || 'lifetime'
        });
    } catch (err) {
        console.error('Quiz start error:', err);
        res.status(500).json({ error: 'Failed to start quiz' });
    }
});

// POST /api/student/quiz/upload - Upload file for a question
router.post('/quiz/upload', upload.single('file'), (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const db = dbModule.getDb();
        db.run('INSERT INTO notifications (recipient_role, message, type, target_url) VALUES (?, ?, ?, ?)',
            ['admin', `Student ${req.user!.username} uploaded a file for review: ${req.file.originalname}`, 'quiz_file', 'submissions']);
        dbModule.saveDatabase();

        res.json({
            message: 'File uploaded',
            file_path: '/uploads/' + req.file.filename,
            file_name: req.file.originalname
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

// POST /api/student/quiz/submit
router.post('/quiz/submit', (req: AuthRequest, res: Response) => {
    try {
        const { attempt_id, answers } = req.body;

        if (!attempt_id || !answers || !Array.isArray(answers)) {
            res.status(400).json({ error: 'Attempt ID and answers are required' });
            return;
        }

        const attempt = getOne(
            'SELECT * FROM quiz_attempts WHERE id = ? AND student_id = ? AND completed_at IS NULL',
            [attempt_id, req.user!.id]
        );

        if (!attempt) {
            res.status(404).json({ error: 'Active quiz attempt not found' });
            return;
        }

        const db = dbModule.getDb();
        let score = 0;
        const results: any[] = [];

        for (const answer of answers) {
            const question = getOne('SELECT correct_answer FROM questions WHERE id = ?', [answer.question_id]);
            if (question) {
                const isCorrect = question.correct_answer === answer.selected_answer ? 1 : 0;
                if (isCorrect) score++;
                db.run(
                    'INSERT INTO attempt_answers (attempt_id, question_id, selected_answer, is_correct, uploaded_file) VALUES (?, ?, ?, ?, ?)',
                    [attempt_id, answer.question_id, answer.selected_answer, isCorrect, answer.uploaded_file || '']
                );
                results.push({
                    question_id: answer.question_id,
                    selected: answer.selected_answer,
                    correct: question.correct_answer,
                    is_correct: !!isCorrect
                });
            }
        }

        db.run('UPDATE quiz_attempts SET score = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
            [score, attempt_id]);
        dbModule.saveDatabase();

        const percentage = Math.round((score / attempt.total_questions) * 100);

        res.json({ message: 'Quiz submitted successfully', score, total: attempt.total_questions, percentage, results });
    } catch (err) {
        console.error('Quiz submit error:', err);
        res.status(500).json({ error: 'Failed to submit quiz' });
    }
});

// GET /api/student/history
router.get('/history', (req: AuthRequest, res: Response) => {
    try {
        const attempts = getAll(`
      SELECT qa.id, c.name as category, c.icon, qa.score, qa.total_questions,
             ROUND(CAST(qa.score AS FLOAT) / qa.total_questions * 100, 1) as percentage,
             qa.started_at, qa.completed_at
      FROM quiz_attempts qa
      JOIN categories c ON qa.category_id = c.id
      WHERE qa.student_id = ? AND qa.completed_at IS NOT NULL
      ORDER BY qa.completed_at DESC
    `, [req.user!.id]);
        res.json({ attempts });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// GET /api/student/leaderboard
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

export default router;
