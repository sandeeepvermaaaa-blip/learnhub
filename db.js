const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
require("dotenv").config();

const dbFile = process.env.DB_FILE || "./data/learnhub.sqlite";
const absoluteDbFile = path.resolve(dbFile);
fs.mkdirSync(path.dirname(absoluteDbFile), { recursive: true });

const db = new Database(absoluteDbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','admin')),
    bio TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    level TEXT NOT NULL DEFAULT 'Beginner',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const count = db.prepare("SELECT COUNT(*) AS n FROM courses").get().n;
if (count === 0) {
  const insert = db.prepare("INSERT INTO courses (title, description, category, level) VALUES (?, ?, ?, ?)");
  const seed = db.transaction(() => {
    insert.run("Web Development Foundations", "Learn how websites work, from HTML and CSS to JavaScript fundamentals.", "Technology", "Beginner");
    insert.run("Python Programming", "Build a strong programming foundation with practical Python examples.", "Programming", "Beginner");
    insert.run("Mathematics: Core Concepts", "Strengthen algebra, equations, percentages and problem-solving skills.", "Mathematics", "Intermediate");
    insert.run("Study Skills & Exam Prep", "Plan revision, improve recall and prepare for exams with confidence.", "Study Skills", "All levels");
  });
  seed();
}

module.exports = db;
