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

// Initialize database and start server
async function start() {
    await dbModule.initializeDatabase();

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

start().catch(console.error);

export default app;
