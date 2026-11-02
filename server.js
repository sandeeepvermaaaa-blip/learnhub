require("dotenv").config();
const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === "production";

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("Set JWT_SECRET in .env to a random string of at least 32 characters.");
  process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}
function setAuthCookie(res, user) {
  res.cookie("learnhub_token", signToken(user), {
    httpOnly: true, secure: isProduction, sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, path: "/"
  });
}
function authRequired(req, res, next) {
  const token = req.cookies.learnhub_token;
  if (!token) return res.status(401).json({ error: "Please log in to continue." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT id, name, email, role, bio, created_at FROM users WHERE id = ?").get(payload.id);
    if (!user) return res.status(401).json({ error: "Account not found." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
}
function adminRequired(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Administrator access required." });
  next();
}
function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, bio: user.bio || "", created_at: user.created_at };
}

app.get("/api/health", (req, res) => res.json({ ok: true, service: "LearnHub API" }));

app.post("/api/auth/signup", authLimiter, async (req, res) => {
  const name = cleanText(req.body.name, 70);
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (name.length < 2) return res.status(400).json({ error: "Name must contain at least 2 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const role = process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL.toLowerCase() ? "admin" : "student";
    const result = db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)").run(name, email, passwordHash, role);
    const user = db.prepare("SELECT id,name,email,role,bio,created_at FROM users WHERE id=?").get(result.lastInsertRowid);
    setAuthCookie(res, user);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (String(err.code).includes("SQLITE_CONSTRAINT")) return res.status(409).json({ error: "An account with this email already exists." });
    console.error(err);
    res.status(500).json({ error: "Could not create account." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Incorrect email or password." });
  setAuthCookie(res, user);
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("learnhub_token", { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" });
  res.json({ ok: true });
});

app.get("/api/me", authRequired, (req, res) => res.json({ user: publicUser(req.user) }));

app.patch("/api/profile", authRequired, (req, res) => {
  const name = cleanText(req.body.name, 70);
  const bio = cleanText(req.body.bio, 280);
  if (name.length < 2) return res.status(400).json({ error: "Name must contain at least 2 characters." });
  db.prepare("UPDATE users SET name=?, bio=? WHERE id=?").run(name, bio, req.user.id);
  const user = db.prepare("SELECT id,name,email,role,bio,created_at FROM users WHERE id=?").get(req.user.id);
  res.json({ user: publicUser(user) });
});

app.get("/api/courses", (req, res) => {
  const courses = db.prepare(`
    SELECT c.*, COUNT(e.id) AS students
    FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id
    GROUP BY c.id ORDER BY c.id DESC
  `).all();
  res.json({ courses });
});

app.post("/api/courses/:id/enroll", authRequired, (req, res) => {
  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || !db.prepare("SELECT id FROM courses WHERE id=?").get(courseId)) return res.status(404).json({ error: "Course not found." });
  try {
    db.prepare("INSERT INTO enrollments (user_id,course_id) VALUES (?,?)").run(req.user.id, courseId);
  } catch (err) {
    if (!String(err.code).includes("SQLITE_CONSTRAINT")) throw err;
  }
  res.json({ ok: true, message: "You are enrolled in this course." });
});

app.get("/api/my-courses", authRequired, (req, res) => {
  const courses = db.prepare(`
    SELECT c.*, e.created_at AS enrolled_at
    FROM enrollments e JOIN courses c ON c.id=e.course_id
    WHERE e.user_id=? ORDER BY e.created_at DESC
  `).all(req.user.id);
  res.json({ courses });
});

app.post("/api/contact", contactLimiter, (req, res) => {
  const name = cleanText(req.body.name, 70);
  const email = cleanText(req.body.email, 160).toLowerCase();
  const subject = cleanText(req.body.subject, 120);
  const message = cleanText(req.body.message, 2000);
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || subject.length < 3 || message.length < 10) {
    return res.status(400).json({ error: "Please complete every field. Message must be at least 10 characters." });
  }
  db.prepare("INSERT INTO messages (name,email,subject,message) VALUES (?,?,?,?)").run(name,email,subject,message);
  res.status(201).json({ ok: true, message: "Your message has been sent." });
});

// Admin API
app.get("/api/admin/overview", authRequired, adminRequired, (req, res) => {
  const users = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const courses = db.prepare("SELECT COUNT(*) AS n FROM courses").get().n;
  const enrollments = db.prepare("SELECT COUNT(*) AS n FROM enrollments").get().n;
  const unread = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE is_read=0").get().n;
  res.json({ users, courses, enrollments, unread });
});

app.get("/api/admin/users", authRequired, adminRequired, (req, res) => {
  const users = db.prepare("SELECT id,name,email,role,bio,created_at FROM users ORDER BY created_at DESC LIMIT 200").all();
  res.json({ users });
});

app.get("/api/admin/messages", authRequired, adminRequired, (req, res) => {
  const messages = db.prepare("SELECT * FROM messages ORDER BY created_at DESC LIMIT 200").all();
  res.json({ messages });
});

app.patch("/api/admin/messages/:id/read", authRequired, adminRequired, (req, res) => {
  db.prepare("UPDATE messages SET is_read=1 WHERE id=?").run(Number(req.params.id));
  res.json({ ok: true });
});

app.post("/api/admin/courses", authRequired, adminRequired, (req, res) => {
  const title = cleanText(req.body.title, 100);
  const description = cleanText(req.body.description, 600);
  const category = cleanText(req.body.category, 50) || "General";
  const level = cleanText(req.body.level, 30) || "Beginner";
  if (title.length < 3 || description.length < 10) return res.status(400).json({ error: "Enter a title and a description of at least 10 characters." });
  const result = db.prepare("INSERT INTO courses (title,description,category,level) VALUES (?,?,?,?)").run(title,description,category,level);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.delete("/api/admin/courses/:id", authRequired, adminRequired, (req, res) => {
  db.prepare("DELETE FROM courses WHERE id=?").run(Number(req.params.id));
  res.json({ ok: true });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`LearnHub is running at http://localhost:${PORT}`));
