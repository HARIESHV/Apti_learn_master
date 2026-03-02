
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function checkSchema() {
    const SQL = await initSqlJs();
    const DB_PATH = path.join(__dirname, 'aptilearn.db');

    if (!fs.existsSync(DB_PATH)) {
        console.error('Database file not found at:', DB_PATH);
        return;
    }

    const fileBuffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(fileBuffer);

    const results = db.exec("PRAGMA table_info(questions)");
    console.log('Schema for table "questions":');
    results[0].values.forEach(row => {
        console.log(`- ${row[1]} (${row[2]})`);
    });

    const categories = db.exec("SELECT id, name FROM categories");
    console.log('\nCategories in DB:');
    if (categories[0]) {
        categories[0].values.forEach(row => {
            console.log(`- ID: ${row[0]}, Name: ${row[1]}`);
        });
    } else {
        console.log('No categories found.');
    }
}

checkSchema().catch(console.error);
