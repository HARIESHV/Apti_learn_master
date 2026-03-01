import express from 'express';
import cors from 'cors';
import path from 'path';
import dbModule from './database';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import studentRoutes from './routes/student';
import messageRoutes from './routes/messages';
import sessionRoutes from './routes/sessions';
import notificationRoutes from './routes/notifications';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database
let dbInitialized = false;
async function initialize() {
    if (!dbInitialized) {
        await dbModule.initializeDatabase();
        dbInitialized = true;
    }
}

// Ensure DB is initialized before processing ANY request (Critical for Vercel)
app.use(async (req, res, next) => {
    try {
        await initialize();
        next();
    } catch (err: any) {
        console.error('Database Init Fail:', err);
        res.status(500).json({
            error: 'Database Initialization Error',
            details: err.message || err.toString(),
            stack: err.stack
        });
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/notifications', notificationRoutes);

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/student', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'student.html'));
});

// Only listen on local development. Vercel handles the export.
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`
  ╔══════════════════════════════════════════╗
  ║     🎓 AptiLearn Master Server          ║
  ║     Running on http://localhost:${PORT}    ║
  ║     Database: SQLite (aptilearn.db)     ║
  ╚══════════════════════════════════════════╝
        `);
    });
}

export default app;
