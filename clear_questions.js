/**
 * One-time script to clear all existing questions and attempt_answers from the DB.
 * Run with: node clear_questions.js
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'aptilearn.db');

async function clearQuestions() {
    if (!fs.existsSync(DB_PATH)) {
        console.log('❌ Database file not found at:', DB_PATH);
        process.exit(1);
    }

    const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    const buffer = fs.readFileSync(wasmPath);
    const wasmBinary = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const SQL = await initSqlJs({ wasmBinary });

    const fileBuffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(fileBuffer);

    // Count before deletion
    const beforeQ = db.exec('SELECT COUNT(*) FROM questions')[0]?.values[0][0] ?? 0;
    const beforeA = db.exec('SELECT COUNT(*) FROM attempt_answers')[0]?.values[0][0] ?? 0;
    console.log(`📊 Before: ${beforeQ} questions, ${beforeA} attempt_answers`);

    // Clear questions and related attempt answers
    db.run('DELETE FROM attempt_answers');
    db.run('DELETE FROM questions');

    // Count after deletion
    const afterQ = db.exec('SELECT COUNT(*) FROM questions')[0]?.values[0][0] ?? 0;
    const afterA = db.exec('SELECT COUNT(*) FROM attempt_answers')[0]?.values[0][0] ?? 0;
    console.log(`✅ After: ${afterQ} questions, ${afterA} attempt_answers`);

    // Save back to disk
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    console.log('💾 Database saved successfully.');
    db.close();
}

clearQuestions().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
