const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const SQL = await initSqlJs();
    const DB_PATH = path.join(__dirname, 'aptilearn.db');

    if (!fs.existsSync(DB_PATH)) {
        console.error('Database file not found at:', DB_PATH);
        return;
    }

    const fileBuffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(fileBuffer);

    console.log('Running manual migration for question_image...');
    try {
        db.run('ALTER TABLE questions ADD COLUMN question_image TEXT DEFAULT \'\'');
        console.log('Successfully added question_image column.');

        const data = db.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
        console.log('Database saved.');
    } catch (e) {
        if (e.message.includes('duplicate column name')) {
            console.log('Column already exists.');
        } else {
            console.error('Migration failed:', e);
        }
    }
}

runMigration().catch(console.error);
