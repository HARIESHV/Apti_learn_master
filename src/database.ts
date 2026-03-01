import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

let DB_PATH = path.join(__dirname, '..', 'aptilearn.db');

// Handle Vercel read-only filesystem by moving DB to /tmp if necessary
if (process.env.VERCEL) {
  const tmpPath = path.join('/tmp', 'aptilearn.db');
  if (!fs.existsSync(tmpPath) && fs.existsSync(DB_PATH)) {
    fs.copyFileSync(DB_PATH, tmpPath);
  }
  DB_PATH = tmpPath;
}

let db: SqlJsDatabase;

export async function initializeDatabase(): Promise<SqlJsDatabase> {
  const wasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({
    locateFile: (file) => file.endsWith('.wasm') ? wasmPath : file
  });

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON;');

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'student')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      icon TEXT DEFAULT '📚',
      time_limit INTEGER DEFAULT 0,
      access_type TEXT DEFAULT 'lifetime' CHECK(access_type IN ('lifetime', 'limited')),
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS subtopics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT '📌',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      question_description TEXT DEFAULT '',
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_answer TEXT NOT NULL CHECK(correct_answer IN ('A', 'B', 'C', 'D')),
      difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id),
      category_id INTEGER NOT NULL REFERENCES categories(id),
      score INTEGER NOT NULL DEFAULT 0,
      total_questions INTEGER NOT NULL,
      time_limit INTEGER DEFAULT 0,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attempt_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id),
      selected_answer TEXT CHECK(selected_answer IN ('A', 'B', 'C', 'D')),
      is_correct INTEGER NOT NULL DEFAULT 0,
      uploaded_file TEXT DEFAULT ''
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS live_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      meet_link TEXT NOT NULL,
      description TEXT DEFAULT '',
      scheduled_at DATETIME,
      is_active INTEGER DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      sender_role TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      recipient_id INTEGER DEFAULT NULL,
      message_text TEXT DEFAULT '',
      file_path TEXT DEFAULT '',
      file_name TEXT DEFAULT '',
      is_broadcast INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_role TEXT,            -- 'admin' or 'student'
      recipient_id INTEGER DEFAULT NULL, -- NULL means all of that role
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add new columns to existing tables if they don't exist
  try { db.run('ALTER TABLE categories ADD COLUMN time_limit INTEGER DEFAULT 0'); } catch (e) { }
  try { db.run('ALTER TABLE categories ADD COLUMN access_type TEXT DEFAULT \'lifetime\''); } catch (e) { }
  try { db.run('ALTER TABLE questions ADD COLUMN question_description TEXT DEFAULT \'\''); } catch (e) { }
  try { db.run('ALTER TABLE questions ADD COLUMN time_limit INTEGER DEFAULT 0'); } catch (e) { }
  try { db.run('ALTER TABLE quiz_attempts ADD COLUMN time_limit INTEGER DEFAULT 0'); } catch (e) { }
  try { db.run('ALTER TABLE attempt_answers ADD COLUMN uploaded_file TEXT DEFAULT \'\''); } catch (e) { }
  try { db.run('ALTER TABLE questions ADD COLUMN subtopic_id INTEGER DEFAULT NULL'); } catch (e) { }

  saveDatabase();
  console.log('✅ Database initialized successfully');
  return db;
}

export function saveDatabase(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

export function getDb(): SqlJsDatabase {
  return db;
}

// Shared helpers
export function getOne(sql: string, params: any[] = []): any {
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

export function getAll(sql: string, params: any[] = []): any[] {
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

export default { initializeDatabase, getDb, saveDatabase, getOne, getAll };
