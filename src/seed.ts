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

    // Create categories
    const categories = [
        ['Quantitative Aptitude', 'Numbers, algebra, arithmetic, and mathematical problem solving', '🔢'],
        ['Logical Reasoning', 'Patterns, sequences, puzzles, and analytical thinking', '🧩'],
        ['Verbal Ability', 'Grammar, vocabulary, comprehension, and verbal reasoning', '📝'],
        ['Data Interpretation', 'Charts, graphs, tables, and data analysis', '📊'],
        ['General Knowledge', 'Current affairs, science, history, and geography', '🌍'],
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
            { question_text: 'What is 15% of 200?', option_a: '25', option_b: '30', option_c: '35', option_d: '20', correct_answer: 'B', difficulty: 'easy' },
            { question_text: 'If a train travels 360 km in 4 hours, what is its speed in km/h?', option_a: '80', option_b: '85', option_c: '90', option_d: '95', correct_answer: 'C', difficulty: 'easy' },
            { question_text: 'The ratio of two numbers is 3:5. If their sum is 64, find the larger number.', option_a: '24', option_b: '40', option_c: '36', option_d: '48', correct_answer: 'B', difficulty: 'medium' },
            { question_text: 'A shopkeeper sells an item at 20% profit. If the cost price is ₹500, what is the selling price?', option_a: '₹550', option_b: '₹580', option_c: '₹600', option_d: '₹620', correct_answer: 'C', difficulty: 'easy' },
            { question_text: 'Find the compound interest on ₹10,000 at 10% per annum for 2 years.', option_a: '₹2,000', option_b: '₹2,100', option_c: '₹2,050', option_d: '₹1,900', correct_answer: 'B', difficulty: 'medium' },
            { question_text: 'If x + y = 10 and xy = 21, find x² + y².', option_a: '58', option_b: '52', option_c: '48', option_d: '62', correct_answer: 'A', difficulty: 'hard' },
            { question_text: 'A pipe can fill a tank in 6 hours. Another pipe can empty it in 8 hours. If both are opened, how long to fill the tank?', option_a: '20 hours', option_b: '24 hours', option_c: '18 hours', option_d: '12 hours', correct_answer: 'B', difficulty: 'hard' },
        ],
        'Logical Reasoning': [
            { question_text: 'Find the next number in the series: 2, 6, 12, 20, 30, ?', option_a: '40', option_b: '42', option_c: '38', option_d: '44', correct_answer: 'B', difficulty: 'medium' },
            { question_text: 'All roses are flowers. Some flowers are red. Which conclusion follows?', option_a: 'All roses are red', option_b: 'Some roses are red', option_c: 'No rose is red', option_d: 'None of these definitely follows', correct_answer: 'D', difficulty: 'medium' },
            { question_text: 'If A is the brother of B, B is the sister of C, and C is the father of D, then how is A related to D?', option_a: 'Uncle', option_b: 'Father', option_c: 'Grandfather', option_d: 'Brother', correct_answer: 'A', difficulty: 'medium' },
            { question_text: 'Which word does NOT belong in the group: Cat, Dog, Bird, Fish, Car?', option_a: 'Cat', option_b: 'Bird', option_c: 'Car', option_d: 'Fish', correct_answer: 'C', difficulty: 'easy' },
            { question_text: 'Pointing to a photograph, Raj says "She is the daughter of the only son of my grandfather". How is the girl related to Raj?', option_a: 'Niece', option_b: 'Daughter', option_c: 'Sister', option_d: 'Cousin', correct_answer: 'C', difficulty: 'hard' },
            { question_text: 'If APPLE is coded as 50, then MANGO is coded as?', option_a: '55', option_b: '57', option_c: '59', option_d: '51', correct_answer: 'B', difficulty: 'medium' },
        ],
        'Verbal Ability': [
            { question_text: 'Choose the synonym of "Abundant":', option_a: 'Scarce', option_b: 'Plentiful', option_c: 'Rare', option_d: 'Limited', correct_answer: 'B', difficulty: 'easy' },
            { question_text: 'Choose the antonym of "Benevolent":', option_a: 'Kind', option_b: 'Generous', option_c: 'Malevolent', option_d: 'Charitable', correct_answer: 'C', difficulty: 'easy' },
            { question_text: 'Identify the correctly spelled word:', option_a: 'Accomodate', option_b: 'Accommodate', option_c: 'Acomodate', option_d: 'Acommodate', correct_answer: 'B', difficulty: 'medium' },
            { question_text: '"He ___ to the store yesterday." Choose the correct word.', option_a: 'go', option_b: 'goes', option_c: 'went', option_d: 'going', correct_answer: 'C', difficulty: 'easy' },
            { question_text: 'The idiom "Break the ice" means:', option_a: 'To break something', option_b: 'To destroy', option_c: 'To initiate conversation', option_d: 'To freeze', correct_answer: 'C', difficulty: 'medium' },
        ],
        'Data Interpretation': [
            { question_text: "If a company's revenue was ₹50L in Q1, ₹60L in Q2, ₹45L in Q3, ₹65L in Q4, what is the average quarterly revenue?", option_a: '₹52L', option_b: '₹55L', option_c: '₹57L', option_d: '₹53L', correct_answer: 'B', difficulty: 'easy' },
            { question_text: 'In a pie chart, if sector A is 90°, what percentage does it represent?', option_a: '20%', option_b: '25%', option_c: '30%', option_d: '35%', correct_answer: 'B', difficulty: 'easy' },
            { question_text: 'If production increased from 200 to 250 units, what is the percentage increase?', option_a: '20%', option_b: '25%', option_c: '30%', option_d: '15%', correct_answer: 'B', difficulty: 'easy' },
            { question_text: 'A bar chart shows sales: Mon=100, Tue=150, Wed=120, Thu=180, Fri=200. What is the total sales?', option_a: '700', option_b: '750', option_c: '800', option_d: '650', correct_answer: 'B', difficulty: 'medium' },
        ],
        'General Knowledge': [
            { question_text: 'Who wrote the Indian National Anthem?', option_a: 'Mahatma Gandhi', option_b: 'Jawaharlal Nehru', option_c: 'Rabindranath Tagore', option_d: 'Subhash Chandra Bose', correct_answer: 'C', difficulty: 'easy' },
            { question_text: 'What is the chemical symbol for Gold?', option_a: 'Go', option_b: 'Gd', option_c: 'Au', option_d: 'Ag', correct_answer: 'C', difficulty: 'easy' },
            { question_text: 'Which planet is known as the Red Planet?', option_a: 'Venus', option_b: 'Mars', option_c: 'Jupiter', option_d: 'Saturn', correct_answer: 'B', difficulty: 'easy' },
            { question_text: 'What is the largest ocean in the world?', option_a: 'Atlantic', option_b: 'Indian', option_c: 'Arctic', option_d: 'Pacific', correct_answer: 'D', difficulty: 'easy' },
            { question_text: 'The Kyoto Protocol is related to:', option_a: 'Trade', option_b: 'Climate Change', option_c: 'Nuclear Energy', option_d: 'Human Rights', correct_answer: 'B', difficulty: 'medium' },
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
