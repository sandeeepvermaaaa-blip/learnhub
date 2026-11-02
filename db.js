const { Pool } = require("pg");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing. Add your Neon connection string.");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
});
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student',
      bio TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS courses (
      id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General', level TEXT NOT NULL DEFAULT 'Beginner',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS enrollments (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, course_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
      subject TEXT NOT NULL, message TEXT NOT NULL, is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM courses");
  if (rows[0].n === 0) await pool.query(
    `INSERT INTO courses (title,description,category,level) VALUES
    ('Web Development Foundations','Learn HTML, CSS and JavaScript fundamentals.','Technology','Beginner'),
    ('Python Programming','Build a programming foundation with Python.','Programming','Beginner'),
    ('Mathematics: Core Concepts','Strengthen algebra and problem-solving skills.','Mathematics','Intermediate'),
    ('Study Skills & Exam Prep','Plan revision and prepare for exams confidently.','Study Skills','All levels')`
  );
}
module.exports = { pool, initDb };
