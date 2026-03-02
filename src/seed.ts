import bcrypt from 'bcryptjs';
import dbModule from './database';

function getOne(sql: string, params: any[] = []): any {
    const db = dbModule.getDb();
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let row: any = null;
    if (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        row = {};
        columns.forEach((col: string, i: number) => { row[col] = values[i]; });
    }
    stmt.free();
    return row;
}

function getAll(sql: string, params: any[] = []): any[] {
    const db = dbModule.getDb();
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: any[] = [];
    while (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        const row: any = {};
        columns.forEach((col: string, i: number) => { row[col] = values[i]; });
        rows.push(row);
    }
    stmt.free();
    return rows;
}

async function seed() {
    console.log('🌱 Seeding database...\n');

    await dbModule.initializeDatabase();
    const db = dbModule.getDb();

    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 12);
    try {
        db.run(
            'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
            ['admin', 'admin@aptilearn.com', adminPassword, 'Administrator', 'admin']
        );
        console.log('✅ Admin user created (username: admin, password: admin123)');
    } catch (e) {
        console.log('ℹ️  Admin user already exists');
        // Check if password needs reset to 'admin123'
        const existingAdmin = getOne("SELECT * FROM users WHERE username = 'admin'");
        if (existingAdmin) {
            const match = await bcrypt.compare('admin123', existingAdmin.password_hash);
            if (!match) {
                console.log('🔄 Resetting admin password to "admin123"...');
                db.run('UPDATE users SET password_hash = ? WHERE username = ?', [adminPassword, 'admin']);
                dbModule.saveDatabase();
            }
        }
    }

    // Create sample students
    const studentPassword = await bcrypt.hash('student123', 12);
    const students = [
        ['john_doe', 'john@student.com', 'John Doe'],
        ['jane_smith', 'jane@student.com', 'Jane Smith'],
        ['alex_kumar', 'alex@student.com', 'Alex Kumar'],
    ];

    for (const [username, email, full_name] of students) {
        try {
            db.run(
                'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
                [username, email, studentPassword, full_name, 'student']
            );
            console.log(`✅ Student created: ${username} (password: student123)`);
        } catch (e) {
            console.log(`ℹ️  Student ${username} already exists`);
        }
    }

    // Create categories matching the hardcoded subtopics in admin.js
    const categories = [
        ['Quantitative Aptitude', 'Numbers, algebra, arithmetic, and mathematical problem solving', '🔢'],
        ['Logical Reasoning', 'Patterns, sequences, puzzles, and analytical thinking', '🧠'],
        ['Verbal Ability', 'Grammar, vocabulary, comprehension, and verbal reasoning', '🗣️'],
        ['Placement / Company Focused', 'Mixed aptitude, logical puzzles, and placement-style problems', '💻'],
    ];

    const adminUser = getOne("SELECT id FROM users WHERE username = 'admin'");

    for (const [name, description, icon] of categories) {
        try {
            db.run(
                'INSERT INTO categories (name, description, icon, created_by) VALUES (?, ?, ?, ?)',
                [name, description, icon, adminUser.id]
            );
            console.log(`✅ Category created: ${name}`);
        } catch (e) {
            console.log(`ℹ️  Category ${name} already exists`);
        }
    }

    // Create sample questions
    const allCategories = getAll('SELECT * FROM categories');

    const questionsData: Record<string, any[]> = {
        'Quantitative Aptitude': [
            {},
        ],
        'Logical Reasoning': [
            {},
        ],
        'Verbal Ability': [
            {},],
        'Data Interpretation': [
            {},],
        'General Knowledge': [
            {},
        ],
    };

    let totalQ = 0;
    for (const cat of allCategories) {
        const questions = questionsData[cat.name];
        if (!questions) continue;

        for (const q of questions) {
            try {
                db.run(`
          INSERT INTO questions (category_id, question_text, option_a, option_b, option_c, option_d, correct_answer, difficulty, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [cat.id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.difficulty, adminUser.id]);
                totalQ++;
            } catch (e) {
                // skip duplicates
            }
        }
    }

    dbModule.saveDatabase();

    console.log(`\n✅ ${totalQ} questions seeded across ${allCategories.length} categories`);

    console.log(`
  ╔══════════════════════════════════════════════╗
  ║          🌱 Seed Complete!                   ║
  ╠══════════════════════════════════════════════╣
  ║  Admin Login:                                ║
  ║    Username: admin                           ║
  ║    Password: admin123                        ║
  ║                                              ║
  ║  Student Login:                              ║
  ║    Username: john_doe                        ║
  ║    Password: student123                      ║
  ╚══════════════════════════════════════════════╝
  `);
}

seed().catch(console.error);
