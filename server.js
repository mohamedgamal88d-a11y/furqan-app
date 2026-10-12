require("dotenv").config();
const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

if (!process.env.DATABASE_URL) { console.error("Missing DATABASE_URL"); process.exit(1); }
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) { console.error("SESSION_SECRET must be at least 32 chars"); process.exit(1); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: isProd? { rejectUnauthorized: false } : false });

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "30kb" }));
app.use(express.urlencoded({ extended: false, limit: "30kb" }));
app.use(session({
  store: new PgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: isProd, sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS employees (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, pin_hash TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS branches (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, radius_m INTEGER NOT NULL DEFAULT 300, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS attendance_logs (id BIGSERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id), branch_id INTEGER NOT NULL REFERENCES branches(id), action_type TEXT NOT NULL CHECK (action_type IN ('حضور','انصراف')), latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL, accuracy_m DOUBLE PRECISION, distance_m DOUBLE PRECISION NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  `);

  const branchesData = [
    {"name":"أوسكار - المعادي","lat":29.9605,"lng":31.2569,"radius":300},
    {"name":"أوسكار - التجمع","lat":30.017,"lng":31.425,"radius":300},
    {"name":"أوسكار - مدينة نصر","lat":30.056,"lng":31.338,"radius":300},
    {"name":"أوسكار - الماظه","lat":30.079,"lng":31.347,"radius":300},
    {"name":"أوسكار - مدينتي","lat":30.083,"lng":31.642,"radius":300},
    {"name":"أوسكار - زايد 1","lat":30.009,"lng":30.98,"radius":300},
    {"name":"أوسكار - زايد ايتابا 2","lat":30.032,"lng":31.001,"radius":300},
    {"name":"بنده - المعادي","lat":29.965,"lng":31.276,"radius":300},
    {"name":"بنده - مدينة نصر مكرم","lat":30.067,"lng":31.343,"radius":300},
    {"name":"بنده - استاد","lat":30.069,"lng":31.312,"radius":300},
    {"name":"بنده - الرحاب","lat":30.062,"lng":31.493,"radius":300},
    {"name":"بنده - العبور","lat":30.227,"lng":31.462,"radius":300},
    {"name":"بنده - اكتوبر","lat":30.02,"lng":30.915,"radius":300},
    {"name":"محلاوي - زايد","lat":30.016,"lng":30.985,"radius":300},
    {"name":"محلاوي - عاشر مدينة نصر","lat":30.051,"lng":31.356,"radius":300},
    {"name":"محلاوي - مسطرد","lat":30.138,"lng":31.285,"radius":300},
    {"name":"محلاوي - منصوره","lat":31.037,"lng":31.381,"radius":300},
    {"name":"محلاوي - مارت فيلا","lat":30.028,"lng":31.475,"radius":300},
    {"name":"مؤمن وبشار - محكمة","lat":30.092,"lng":31.337,"radius":300},
    {"name":"مؤمن وبشار - تسعين شمالي","lat":30.026,"lng":31.481,"radius":300},
    {"name":"مؤمن وبشار - اصاله","lat":30.017,"lng":31.412,"radius":300},
    {"name":"البركه 1","lat":30.08,"lng":31.32,"radius":300},
    {"name":"البركه 2","lat":30.082,"lng":31.325,"radius":300},
    {"name":"الحسيني - الرحاب 1","lat":30.0605,"lng":31.4935,"radius":300},
    {"name":"الحسيني B11 - مدينتي","lat":30.0855,"lng":31.6385,"radius":300},
    {"name":"نيو بني B10","lat":30.145,"lng":31.718,"radius":300},
    {"name":"نيو بني B7","lat":30.148,"lng":31.72,"radius":300},
    {"name":"سوق القديم - الرحاب","lat":30.06,"lng":31.4925,"radius":300},
    {"name":"سوق شرقي 1","lat":30.137,"lng":31.708,"radius":300},
    {"name":"سوق شرقي 2","lat":30.138,"lng":31.71,"radius":300},
    {"name":"نيو بني نرجس","lat":30.12,"lng":31.68,"radius":300},
    {"name":"الحسيني تجمع الاول","lat":30.08,"lng":31.48,"radius":300},
    {"name":"A market - الاردنيه","lat":30.3065,"lng":31.7405,"radius":300},
    {"name":"A market - بلازا","lat":30.3095,"lng":31.7355,"radius":300},
    {"name":"أسواق البدر 70","lat":30.3025,"lng":31.7485,"radius":300},
    {"name":"أسواق البدر 43","lat":30.3005,"lng":31.7415,"radius":300},
    {"name":"أسواق البدر 50","lat":30.3155,"lng":31.742,"radius":300},
    {"name":"العلاف - مج 17 امام مستشفى ابن سينا","lat":30.3012,"lng":31.7445,"radius":300},
    {"name":"زون مارت - هرم","lat":29.99,"lng":31.14,"radius":300},
    {"name":"زون مارت - المعادي","lat":29.97,"lng":31.26,"radius":300},
    {"name":"زون مارت - شيراتون","lat":30.11,"lng":31.38,"radius":300},
    {"name":"جولدن - الدائري سلم البارونة","lat":30.0295,"lng":31.4105,"radius":300},
    {"name":"داي تو داي","lat":30.05,"lng":31.35,"radius":300}
  ];
  for (const b of branchesData) {
    await pool.query(`INSERT INTO branches(name, latitude, longitude, radius_m) VALUES($1,$2,$3,$4) ON CONFLICT(name) DO UPDATE SET latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, radius_m=EXCLUDED.radius_m`, [b.name, b.lat, b.lng, b.radius]);
  }
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "";
  const exists = await pool.query("SELECT id FROM admins LIMIT 1");
  if (!exists.rowCount) {
    if (password.length < 12) throw new Error("Set ADMIN_PASSWORD to at least 12 chars");
    const hash = await bcrypt.hash(password, 12);
    await pool.query("INSERT INTO admins(username,password_hash) VALUES($1,$2)", [username, hash]);
  }
}

function requireAdmin(req, res, next) { if (req.session && req.session.adminId) return next(); return res.status(401).json({ error: "يجب تسجيل دخول الإدارة أولاً." }); }
function cleanText(v, max=100) { return String(v?? "").trim().slice(0, max); }
function distanceMeters(lat1, lon1, lat2, lon2) { const R = 6371000, rad = x => x * Math.PI / 180; const dLat = rad(lat2-lat1), dLon = rad(lon2-lon1); const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2; return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); }
async function sendTelegram(message) { const token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_CHAT_ID; if (!token ||!chatId) return; try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ chat_id: chatId, text: message }) }); } catch(e){} }

app.get("/api/health", (_req,res) => res.json({ok:true}));
app.post("/api/admin/login", async (req,res) => {
  const username = cleanText(req.body.username, 80); const password = String(req.body.password || "");
  const result = await pool.query("SELECT id,username,password_hash FROM admins WHERE username=$1", [username]);
  if (!result.rowCount ||!(await bcrypt.compare(password, result.rows[0].password_hash))) return res.status(401).json({error:"اسم المستخدم أو كلمة السر غير صحيحة."});
  req.session.adminId = result.rows[0].id; req.session.adminUsername = result.rows[0].username; res.json({ok:true, username:result.rows[0].username});
});
app.post("/api/admin/logout", requireAdmin, (req,res) => req.session.destroy(() => res.json({ok:true})));
app.get("/api/admin/me", requireAdmin, (req,res) => res.json({ok:true, username:req.session.adminUsername}));
app.get("/api/branches", async (_req,res) => { const r = await pool.query("SELECT id,name,active,(latitude IS NOT NULL AND longitude IS NOT NULL) AS configured FROM branches WHERE active=true ORDER BY name"); res.json(r.rows); });

app.post("/api/attendance", async (req,res) => {
  try {
    const code = cleanText(req.body.code, 40); const pin = String(req.body.pin || ""); const action = cleanText(req.body.action, 20); const branchId = Number(req.body.branchId);
    const lat = Number(req.body.latitude), lng = Number(req.body.longitude); const accuracy = Number(req.body.accuracy);
    if (!code ||!pin ||!Number.isInteger(branchId) ||!["حضور","انصراف"].includes(action)) return res.status(400).json({error:"راجع البيانات"});
    if (accuracy > 100) return res.status(400).json({error:"دقة الموقع ضعيفة"});
    const er = await pool.query("SELECT id,name,pin_hash FROM employees WHERE code=$1 AND active=true", [code]);
    if (!er.rowCount ||!(await bcrypt.compare(pin, er.rows[0].pin_hash))) return res.status(401).json({error:"كود الموظف أو الرقم السري غير صحيح."});
    const br = await pool.query("SELECT id,name,latitude,longitude,radius_m FROM branches WHERE id=$1 AND active=true", [branchId]);
    if (!br.rowCount || br.rows[0].latitude === null) return res.status(400).json({error:"الفرع لم يتم ضبط إحداثياته"});
    const b = br.rows[0]; const dist = distanceMeters(lat,lng,Number(b.latitude),Number(b.longitude));
    if (dist > Number(b.radius_m)) return res.status(403).json({error:`خارج النطاق (${Math.round(dist)} متر)`});
    const saved = await pool.query("INSERT INTO attendance_logs(employee_id,branch_id,action_type,latitude,longitude,accuracy_m,distance_m) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING created_at", [er.rows[0].id,b.id,action,lat,lng,accuracy,Math.round(dist)]);
    const when = new Date(saved.rows[0].created_at).toLocaleString("ar-EG",{timeZone:"Africa/Cairo"});
    await sendTelegram(`تسجيل ${action}\n${er.rows[0].name} (${code})\n${b.name}\n${when}`);
    res.json({ok:true,message:`تم تسجيل ${action} بنجاح.`, time:when});
  } catch(e) { console.error(e); res.status(500).json({error:"خطأ داخلي"}); }
});

app.get("/api/admin/logs", requireAdmin, async (req,res) => {
  const from = cleanText(req.query.from,10), to = cleanText(req.query.to,10); const params=[], conditions=[];
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { params.push(from); conditions.push(`l.created_at >= $${params.length}::date`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { params.push(to); conditions.push(`l.created_at < ($${params.length}::date + INTERVAL '1 day')`); }
  const where = conditions.length? "WHERE "+conditions.join(" AND ") : "";
  const r = await pool.query(`SELECT l.id,e.code,e.name AS employee,b.name AS branch,l.action_type,l.created_at,l.latitude,l.longitude,l.accuracy_m,l.distance_m FROM attendance_logs l JOIN employees e ON e.id=l.employee_id JOIN branches b ON b.id=l.branch_id ${where} ORDER BY l.created_at DESC LIMIT 5000`, params);
  res.json(r.rows);
});
app.get("/api/admin/employees", requireAdmin, async (_req,res) => { const r=await pool.query("SELECT id,code,name,active FROM employees ORDER BY name"); res.json(r.rows); });
app.post("/api/admin/employees", requireAdmin, async (req,res) => {
  const code=cleanText(req.body.code,40), name=cleanText(req.body.name,100), pin=String(req.body.pin||"");
  if (!code ||!name || pin.length<4) return res.status(400).json({error:"أدخل كود الموظف والاسم ورقمًا سريًا لا يقل عن 4"});
  try { const hash=await bcrypt.hash(pin,12); const r=await pool.query("INSERT INTO employees(code,name,pin_hash) VALUES($1,$2,$3) RETURNING id,code,name,active",[code,name,hash]); res.json(r.rows[0]); }
  catch(e) { res.status(400).json({error:"كود الموظف مستخدم بالفعل"}); }
});
app.patch("/api/admin/employees/:id", requireAdmin, async (req,res) => {
  const id=Number(req.params.id), active=Boolean(req.body.active);
  const r=await pool.query("UPDATE employees SET active=$1 WHERE id=$2 RETURNING id,code,name,active",[active,id]);
  if(!r.rowCount) return res.status(404).json({error:"الموظف غير موجود."}); res.json(r.rows[0]);
});
app.post("/api/admin/employees/:id/pin", requireAdmin, async (req,res) => {
  const id = Number(req.params.id); const pin = String(req.body.pin||"");
  if(pin.length<4) return res.status(400).json({error:"الرقم السري يجب أن يكون 4 أحرف على الأقل."});
  const hash = await bcrypt.hash(pin,12); await pool.query("UPDATE employees SET pin_hash=$1 WHERE id=$2",[hash,id]);
  res.json({ok:true, message:"تم تغيير باسورد الموظف بنجاح"});
});
app.get("/api/admin/branches", requireAdmin, async (_req,res) => { const r=await pool.query("SELECT id,name,latitude,longitude,radius_m,active FROM branches ORDER BY name"); res.json(r.rows); });
app.patch("/api/admin/branches/:id", requireAdmin, async (req,res) => {
  const name=cleanText(req.body.name,120); const lat=req.body.latitude===""?null:Number(req.body.latitude); const lng=req.body.longitude===""?null:Number(req.body.longitude); const radius=Number(req.body.radius_m);
  if(!name || radius<30 || radius>1000) return res.status(400).json({error:"بيانات الفرع غلط"});
  const r=await pool.query("UPDATE branches SET name=$1,latitude=$2,longitude=$3,radius_m=$4,active=$5 WHERE id=$6 RETURNING *", [name,lat,lng,radius,req.body.active!==false,Number(req.params.id)]); res.json(r.rows[0]);
});
app.post("/api/admin/branches", requireAdmin, async (req,res) => {
  const name=cleanText(req.body.name,120); const lat=Number(req.body.latitude); const lng=Number(req.body.longitude); const radius=Number(req.body.radius_m||300);
  const r=await pool.query("INSERT INTO branches(name,latitude,longitude,radius_m) VALUES($1,$2,$3,$4) RETURNING *",[name,lat,lng,radius]); res.json(r.rows[0]);
});
app.get("/api/admin/export.csv", requireAdmin, async (_req,res) => {
  const r=await pool.query(`SELECT e.code,e.name AS employee,b.name AS branch,l.action_type,l.created_at FROM attendance_logs l JOIN employees e ON e.id=l.employee_id JOIN branches b ON b.id=l.branch_id ORDER BY l.created_at DESC`);
  const cols=["code","employee","branch","action_type","created_at"]; const csv=[cols.join(","),...r.rows.map(row=>cols.map(k=>`"${String(row[k]??"").replace(/"/g,'""')}"`).join(","))].join("\r\n");
  res.setHeader("Content-Type","text/csv; charset=utf-8"); res.setHeader("Content-Disposition",'attachment; filename="furqan-attendance.csv"'); res.send("\uFEFF"+csv);
});
app.get("/admin", (_req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("*", (_req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
initDb().then(()=>app.listen(PORT,()=>console.log(`Furqan app listening on ${PORT}`))).catch(e=>{console.error(e);process.exit(1);});