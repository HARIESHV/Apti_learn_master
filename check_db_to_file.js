
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function checkSchema() {
    const SQL = await initSqlJs();
    const DB_PATH = path.join(__dirname, 'aptilearn.db');

    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync('db_check_result.json', JSON.stringify({ error: 'Database file not found' }, null, 2));
        return;
    }

    const fileBuffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(fileBuffer);

    const schema = db.exec("PRAGMA table_info(questions)");
    const categories = db.exec("SELECT id, name FROM categories");
    const questionCount = db.exec("SELECT COUNT(*) FROM questions");
    const sampleQuestions = db.exec("SELECT * FROM questions LIMIT 5");

    const result = {
        schema: schema[0]?.values.map(row => ({ name: row[1], type: row[2] })),
        categories: categories[0]?.values.map(row => ({ id: row[0], name: row[1] })),
        totalQuestions: questionCount[0]?.values[0][0],
        sampleQuestions: sampleQuestions[0]?.values
    };

    fs.writeFileSync('db_check_result.json', JSON.stringify(result, null, 2));
}

checkSchema().catch(err => {
    fs.writeFileSync('db_check_result.json', JSON.stringify({ error: err.message }, null, 2));
});
