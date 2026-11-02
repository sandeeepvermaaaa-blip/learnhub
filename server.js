require("dotenv").config();
const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { pool, initDb } = require("./db");

const app = express(), PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.JWT_SECRET, production = process.env.NODE_ENV === "production";
if (!SECRET || SECRET.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
const authLimit = rateLimit({ windowMs: 15*60*1000, limit: 30 });
const contactLimit = rateLimit({ windowMs: 60*60*1000, limit: 10 });
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const clean = (v,n) => typeof v === "string" ? v.trim().slice(0,n) : "";
const publicUser = u => ({ id:u.id, name:u.name, email:u.email, role:u.role, bio:u.bio || "", created_at:u.created_at });
function setCookie(res,u) {
  res.cookie("learnhub_token", jwt.sign({id:u.id},SECRET,{expiresIn:"7d"}), {
    httpOnly:true, secure:production, sameSite:"lax", maxAge:7*86400000, path:"/"
  });
}
const auth = wrap(async (req,res,next) => {
  const token=req.cookies.learnhub_token;
  if (!token) return res.status(401).json({error:"Please log in."});
  let payload;
  try { payload=jwt.verify(token,SECRET); } catch { return res.status(401).json({error:"Session expired. Please log in again."}); }
  const {rows}=await pool.query("SELECT id,name,email,role,bio,created_at FROM users WHERE id=$1",[payload.id]);
  if (!rows[0]) return res.status(401).json({error:"Account not found."});
  req.user=rows[0]; next();
});
const admin=(req,res,next)=>req.user.role==="admin"?next():res.status(403).json({error:"Administrator access required."});

app.get("/api/health",(req,res)=>res.json({ok:true,service:"LearnHub"}));
app.post("/api/auth/signup",authLimit,wrap(async(req,res)=>{
  const name=clean(req.body.name,70), email=clean(req.body.email,160).toLowerCase(), password=typeof req.body.password==="string"?req.body.password:"";
  if(name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<8) return res.status(400).json({error:"Enter a valid name/email and password of at least 8 characters."});
  const hash=await bcrypt.hash(password,12), role=process.env.ADMIN_EMAIL && email===process.env.ADMIN_EMAIL.toLowerCase()?"admin":"student";
  try {
    const {rows}=await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role,bio,created_at",[name,email,hash,role]);
    setCookie(res,rows[0]); res.status(201).json({user:publicUser(rows[0])});
  } catch(e) { if(e.code==="23505") return res.status(409).json({error:"Email already registered."}); throw e; }
}));
app.post("/api/auth/login",authLimit,wrap(async(req,res)=>{
  const email=clean(req.body.email,160).toLowerCase(), password=typeof req.body.password==="string"?req.body.password:"";
  const {rows}=await pool.query("SELECT * FROM users WHERE email=$1",[email]), u=rows[0];
  if(!u || !(await bcrypt.compare(password,u.password_hash))) return res.status(401).json({error:"Incorrect email or password."});
  setCookie(res,u); res.json({user:publicUser(u)});
}));
app.post("/api/auth/logout",(req,res)=>{res.clearCookie("learnhub_token",{httpOnly:true,secure:production,sameSite:"lax",path:"/"});res.json({ok:true});});
app.get("/api/me",auth,(req,res)=>res.json({user:publicUser(req.user)}));
app.patch("/api/profile",auth,wrap(async(req,res)=>{
  const name=clean(req.body.name,70),bio=clean(req.body.bio,280);
  if(name.length<2)return res.status(400).json({error:"Name is too short."});
  const {rows}=await pool.query("UPDATE users SET name=$1,bio=$2 WHERE id=$3 RETURNING id,name,email,role,bio,created_at",[name,bio,req.user.id]);
  res.json({user:publicUser(rows[0])});
}));
app.get("/api/courses",wrap(async(req,res)=>{
  const {rows}=await pool.query("SELECT c.*,COUNT(e.id)::int AS students FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id GROUP BY c.id ORDER BY c.id DESC");
  res.json({courses:rows});
}));
app.post("/api/courses/:id/enroll",auth,wrap(async(req,res)=>{
  const id=Number(req.params.id); if(!Number.isSafeInteger(id))return res.status(404).json({error:"Course not found."});
  const found=await pool.query("SELECT id FROM courses WHERE id=$1",[id]); if(!found.rows[0])return res.status(404).json({error:"Course not found."});
  await pool.query("INSERT INTO enrollments(user_id,course_id) VALUES($1,$2) ON CONFLICT(user_id,course_id) DO NOTHING",[req.user.id,id]);
  res.json({ok:true,message:"Enrolled successfully."});
}));
app.get("/api/my-courses",auth,wrap(async(req,res)=>{
  const {rows}=await pool.query("SELECT c.*,e.created_at AS enrolled_at FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=$1 ORDER BY e.created_at DESC",[req.user.id]);
  res.json({courses:rows});
}));
app.post("/api/contact",contactLimit,wrap(async(req,res)=>{
  const name=clean(req.body.name,70),email=clean(req.body.email,160).toLowerCase(),subject=clean(req.body.subject,120),message=clean(req.body.message,2000);
  if(name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || subject.length<3 || message.length<10)return res.status(400).json({error:"Please complete all fields. Message must be at least 10 characters."});
  await pool.query("INSERT INTO messages(name,email,subject,message) VALUES($1,$2,$3,$4)",[name,email,subject,message]);
  res.status(201).json({ok:true,message:"Message sent."});
}));
app.get("/api/admin/overview",auth,admin,wrap(async(req,res)=>{
  const queries=["SELECT COUNT(*)::int n FROM users","SELECT COUNT(*)::int n FROM courses","SELECT COUNT(*)::int n FROM enrollments","SELECT COUNT(*)::int n FROM messages WHERE is_read=FALSE"];
  const r=await Promise.all(queries.map(q=>pool.query(q)));
  res.json({users:r[0].rows[0].n,courses:r[1].rows[0].n,enrollments:r[2].rows[0].n,unread:r[3].rows[0].n});
}));
app.get("/api/admin/users",auth,admin,wrap(async(req,res)=>{const {rows}=await pool.query("SELECT id,name,email,role,bio,created_at FROM users ORDER BY created_at DESC LIMIT 200");res.json({users:rows});}));
app.get("/api/admin/messages",auth,admin,wrap(async(req,res)=>{const {rows}=await pool.query("SELECT * FROM messages ORDER BY created_at DESC LIMIT 200");res.json({messages:rows});}));
app.patch("/api/admin/messages/:id/read",auth,admin,wrap(async(req,res)=>{await pool.query("UPDATE messages SET is_read=TRUE WHERE id=$1",[Number(req.params.id)]);res.json({ok:true});}));
app.post("/api/admin/courses",auth,admin,wrap(async(req,res)=>{
  const title=clean(req.body.title,100),description=clean(req.body.description,600),category=clean(req.body.category,50)||"General",level=clean(req.body.level,30)||"Beginner";
  if(title.length<3||description.length<10)return res.status(400).json({error:"Enter a title and longer description."});
  const {rows}=await pool.query("INSERT INTO courses(title,description,category,level) VALUES($1,$2,$3,$4) RETURNING id",[title,description,category,level]);res.status(201).json({id:rows[0].id});
}));
app.delete("/api/admin/courses/:id",auth,admin,wrap(async(req,res)=>{await pool.query("DELETE FROM courses WHERE id=$1",[Number(req.params.id)]);res.json({ok:true});}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"Server error. Please try again."});});
initDb().then(()=>app.listen(PORT,()=>console.log(`LearnHub listening on ${PORT}`))).catch(e=>{console.error("Database startup failed:",e);process.exit(1);});
