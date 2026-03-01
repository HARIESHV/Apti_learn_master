import dbModule from './src/database';
import bcrypt from 'bcryptjs';

async function registerTest() {
    await dbModule.initializeDatabase();
    const db = dbModule.getDb();

    // Check if the student already exists
    const existing = dbModule.getOne('SELECT id FROM users WHERE username = ?', ['test_student']);
    if (existing) {
        console.log('Test student already exists:', existing);
    } else {
        const password_hash = await bcrypt.hash('test123', 12);
        db.run('INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
            ['test_student', 'test@student.com', password_hash, 'Test Student', 'student']);
        dbModule.saveDatabase();
        console.log('Test student registered successfully!');
    }

    // List all students
    const students = dbModule.getAll("SELECT * FROM users WHERE role = 'student'");
    console.log('Students in DB:', JSON.stringify(students, null, 2));
    process.exit(0);
}

registerTest().catch(console.error);
