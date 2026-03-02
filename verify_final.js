const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function verifyAll() {
    const SQL = await initSqlJs();
    const DB_PATH = path.join(__dirname, 'aptilearn.db');

    if (!fs.existsSync(DB_PATH)) {
        console.error('Database file not found');
        return;
    }

    const fileBuffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(fileBuffer);

    console.log('--- Questions Table Schema ---');
    const schema = db.exec("PRAGMA table_info(questions)");
    if (schema[0]) {
        schema[0].values.forEach(row => {
            console.log(`Column: ${row[1]} (${row[2]})`);
        });
    }

    console.log('\n--- Categories ---');
    const categories = db.exec("SELECT id, name FROM categories");
    if (categories[0]) {
        categories[0].values.forEach(row => {
            console.log(`ID: ${row[0]}, Name: ${row[1]}`);
        });
    }

    console.log('\n--- Recent Questions ---');
    const questions = db.exec("SELECT id, question_text, subtopic_name, question_image FROM questions ORDER BY id DESC LIMIT 3");
    if (questions[0]) {
        questions[0].values.forEach(row => {
            console.log(`ID: ${row[0]}, Text: ${row[1] || '[Image]'}, Subtopic: ${row[2]}, Image: ${row[3]}`);
        });
    } else {
        console.log('No questions found.');
    }
}

verifyAll().catch(console.error);
