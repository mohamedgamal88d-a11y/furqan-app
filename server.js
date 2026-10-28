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

const MAX_RADIUS_M = 200;
const MAX_GPS_ACCURACY_M = 100;
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 17;
const SHIFT_SECONDS = 8 * 3600;

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET must be at least 32 chars");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "30kb" }));
app.use(express.urlencoded({ extended: false, limit: "30kb" }));

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      radius_m INTEGER NOT NULL DEFAULT 200,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS attendance_logs (
      id BIGSERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      action_type TEXT NOT NULL CHECK (action_type IN ('حضور','انصراف')),
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      accuracy_m DOUBLE PRECISION,
      distance_m DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary NUMERIC NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS late_minutes INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS work_hours NUMERIC DEFAULT 0;`);

  const branchesData = [
    {name:"A Market - الاردنيه",lat:30.295282,lng:31.745398},
    {name:"A Market - بلازا",lat:30.280761,lng:31.742033},
    {name:"اسواق البدر 43",lat:30.307081,lng:31.715857},
    {name:"اسواق البدر 50",lat:30.306655,lng:31.716577},
    {name:"اسواق البدر 70",lat:30.318585,lng:31.719398},
    {name:"أوسكار - التجمع",lat:30.027726,lng:31.488742},
    {name:"أوسكار - الماظه",lat:30.087325,lng:31.345787},
    {name:"أوسكار - المعادي",lat:29.961537,lng:31.297026},
    {name:"أوسكار - زايد",lat:30.007918,lng:30.993985},
    {name:"أوسكار - زايد اتيابا",lat:30.057582,lng:30.978112},
    {name:"أوسكار - مدينة نصر",lat:30.052088,lng:31.357359},
    {name:"أوسكار - مدينتي",lat:30.083393,lng:31.638348},
    {name:"البركة 1",lat:30.063803,lng:31.467625},
    {name:"البركة 2",lat:30.048139,lng:31.468779},
    {name:"الحسيني - الرحاب السوق القديم",lat:30.057701,lng:31.491811},
    {name:"الحسيني - B11",lat:30.076974,lng:31.657797},
    {name:"الحسيني - التجمع الاول",lat:30.062331,lng:31.446112},
    {name:"الحسيني السوق شرقي 1",lat:30.069567,lng:31.518018},
    {name:"بنده الاستاد (ريكون بلازا)",lat:30.07305,lng:31.315737},
    {name:"بنده أكتوبر",lat:29.962391,lng:30.927524},
    {name:"بنده الرحاب",lat:30.064227,lng:31.479744},
    {name:"بنده العبور",lat:30.232253,lng:31.460268},
    {name:"بنده المعادي",lat:29.9615,lng:31.247179},
    {name:"بنده قها",lat:30.352054,lng:31.201187},
    {name:"بنده مكرم / مدينة نصر مكرم",lat:30.068993,lng:31.342619},
    {name:"العلاف ماركت 2",lat:30.292717,lng:31.728694},
    {name:"جولدن",lat:29.983296,lng:31.336955},
    {name:"داي تو داي",lat:30.057239,lng:31.490938},
    {name:"زون مارت المعادي",lat:29.981943,lng:31.335668},
    {name:"زون مارت هرم",lat:30.000398,lng:31.189416},
    {name:"زون مارت شيراتون",lat:30.100573,lng:31.374993},
    {name:"نيو بني سوق شرقي",lat:30.06932,lng:31.518787},
    {name:"مؤمن وبشار فرع اصاله",lat:30.0042,lng:31.494912},
    {name:"مؤمن وبشار فرع تسعين شمالي",lat:30.030232,lng:31.462105},
    {name:"مؤمن وبشار فرع المحكمه",lat:30.003863,lng:31.424244},
    {name:"محلاوي زايد",lat:30.053889,lng:30.986778},
    {name:"محلاوي عاشر مدينة نصر",lat:30.052702,lng:31.37822},
    {name:"محلاوي التجمع (مارت فيلا)",lat:30.022777,lng:31.424663},
    {name:"محلاوي مسطرد",lat:30.12949,lng:31.288471},
    {name:"محلاوي منصوره",lat:31.05006,lng:31.402882},
    {name:"نيو بني B10",lat:30.082782,lng:31.65903},
    {name:"نيو بني B7",lat:30.087701,lng:31.647685},
    {name:"نيو بني نرجس",lat:30.009146,lng:31.457337},
    {name:"هايبر هب",lat:30.0692,lng:31.387763},
    {name:"اكسبشن تجمع الخامس",lat:30.020887,lng:31.434309},
    {name:"اكسبشن س - حدائق الأهرام",lat:29.953073,lng:31.096543},
    {name:"اكسبشن ز - حدائق الأهرام",lat:29.980407,lng:31.096933},
    {name:"اكسبشن مدينتي",lat:30.09011,lng:31.641632}
  ];
  const check = await pool.query("SELECT COUNT(*) FROM branches");
  const count = parseInt(check.rows[0].count);
  if (count === 0) {
    for (const b of branchesData) {
      await pool.query(`INSERT INTO branches (name, latitude, longitude, radius_m, active) VALUES ($1,$2,$3,$4,true) ON CONFLICT (name) DO NOTHING`, [b.name, b.lat, b.lng, MAX_RADIUS_M]);
    }
  }
  await pool.query("UPDATE branches SET radius_m = $1 WHERE radius_m > $1", [MAX_RADIUS_M]);
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: "يجب تسجيل دخول الإدارة أولاً." });
}
function cleanText(v, max = 100) { return String(v ?? "").trim().slice(0, max); }
function validCoordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; const rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1); const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function getCairoTimeParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const parts = fmt.formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === 'hour').value);
  const minute = parseInt(parts.find(p => p.type === 'minute').value);
  const second = parseInt(parts.find(p => p.type === 'second').value);
  return { hour, minute, second };
}
function calculateLateMinutes() {
  const { hour, minute } = getCairoTimeParts(new Date());
  if (hour < WORK_START_HOUR) return 0;
  if (hour === WORK_START_HOUR && minute === 0) return 0;
  return (hour - WORK_START_HOUR) * 60 + minute;
}
function formatHMS(totalSeconds) {
  if (!totalSeconds || totalSeconds < 0) return "00:00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return String(h).padStart(2,'0')+":"+String(m).padStart(2,'0')+":"+String(s).padStart(2,'0');
}
function toCairoParts(d) {
  if(!d) return null;
  const dt = new Date(d);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const parts = fmt.formatToParts(dt);
  return {
    h: parseInt(parts.find(p=>p.type==='hour').value),
    m: parseInt(parts.find(p=>p.type==='minute').value),
    s: parseInt(parts.find(p=>p.type==='second').value),
  };
}
async function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN; const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: message }) });
  } catch (e) { console.error("Telegram notification failed"); }
}

app.get("/api/health", (_req, res) => { res.json({ ok: true }); });

app.post("/api/admin/login", async (req, res) => {
  const username = cleanText(req.body.username, 80); const password = String(req.body.password || "");
  if (username === "admin" && password === "12345678") {
    req.session.adminId = 1; req.session.adminUsername = "admin";
    return req.session.save(err => {
      if (err) return res.status(500).json({ error: "تعذر حفظ جلسة تسجيل الدخول" });
      res.json({ success: true });
    });
  }
  return res.status(401).json({ error: "اسم المستخدم أو كلمة السر غير صحيحة" });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
app.get("/api/admin/me", requireAdmin, (req, res) => { res.json({ ok: true, username: req.session.adminUsername }); });

app.get("/api/branches", async (_req, res) => {
  try {
    const r = await pool.query(`SELECT id, name, active, (latitude IS NOT NULL AND longitude IS NOT NULL) AS configured FROM branches WHERE active = true ORDER BY name`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: "تعذر تحميل الفروع" }); }
});

app.get("/api/attendance/status", async (req, res) => {
  try {
    const code = cleanText(req.query.code, 40);
    if (!code) return res.json({ hasAttendance: false, hasLeave: false });
    const r = await pool.query(`SELECT l.action_type FROM attendance_logs l JOIN employees e ON e.id = l.employee_id WHERE e.code = $1 AND (l.created_at AT TIME ZONE 'Africa/Cairo')::date = (NOW() AT TIME ZONE 'Africa/Cairo')::date`, [code]);
    res.json({ hasAttendance: r.rows.some(x => x.action_type === "حضور"), hasLeave: r.rows.some(x => x.action_type === "انصراف") });
  } catch (e) { res.status(500).json({ error: "تعذر تحميل حالة الحضور" }); }
});

app.post("/api/attendance", async (req, res) => {
  try {
    const code = cleanText(req.body.code, 40); const pin = String(req.body.pin || ""); const action = cleanText(req.body.action, 20); const branchId = Number(req.body.branchId);
    const lat = Number(req.body.latitude); const lng = Number(req.body.longitude); const accuracy = Number(req.body.accuracy);
    if (!code || !pin || !Number.isInteger(branchId) || branchId <= 0 || !["حضور", "انصراف"].includes(action)) return res.status(400).json({ error: "راجع بيانات الموظف والفرع ونوع التسجيل" });
    if (!validCoordinates(lat, lng)) return res.status(400).json({ error: "إحداثيات GPS غير صحيحة. فعّل الموقع وحاول مرة أخرى." });
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_GPS_ACCURACY_M) return res.status(400).json({ error: "دقة الموقع ضعيفة. افتح GPS وحاول مرة أخرى." });
    const er = await pool.query(`SELECT id, name, pin_hash FROM employees WHERE code = $1 AND active = true`, [code]);
    if (!er.rowCount || !(await bcrypt.compare(pin, er.rows[0].pin_hash))) return res.status(401).json({ error: "كود الموظف أو الرقم السري غير صحيح." });
    const br = await pool.query(`SELECT id, name, latitude, longitude, radius_m FROM branches WHERE id = $1 AND active = true`, [branchId]);
    if (!br.rowCount || br.rows[0].latitude === null || br.rows[0].longitude === null || !validCoordinates(Number(br.rows[0].latitude), Number(br.rows[0].longitude))) return res.status(400).json({ error: "إحداثيات الفرع غير مضبوطة. تواصل مع الإدارة." });
    const employee = er.rows[0]; const branch = br.rows[0];
    const dist = distanceMeters(lat, lng, Number(branch.latitude), Number(branch.longitude));
    const radius = Math.min(MAX_RADIUS_M, Math.max(0, Number(branch.radius_m) || 0));
    if (!Number.isFinite(dist)) return res.status(400).json({ error: "تعذر حساب المسافة. حاول مرة أخرى." });
    const todayCheck = await pool.query(`SELECT action_type, created_at FROM attendance_logs WHERE employee_id = $1 AND (created_at AT TIME ZONE 'Africa/Cairo')::date = (NOW() AT TIME ZONE 'Africa/Cairo')::date FOR SHARE`, [employee.id]);
    const hasAttendanceToday = todayCheck.rows.some(x => x.action_type === "حضور"); const hasLeaveToday = todayCheck.rows.some(x => x.action_type === "انصراف");
    if (action === "حضور" && hasAttendanceToday) return res.status(400).json({ error: "أنت سجلت حضور النهارده بالفعل.", alreadyDone: true });
    if (action === "انصراف" && !hasAttendanceToday) return res.status(400).json({ error: "لازم تسجل حضور الأول." });
    if (action === "انصراف" && hasLeaveToday) return res.status(400).json({ error: "أنت سجلت انصراف النهارده بالفعل.", alreadyDone: true });
    if (dist > radius) return res.status(403).json({ error: `أنت خارج نطاق الفرع بمسافة ${Math.round(dist)} متر. الحد الأقصى ${radius} متر.` });
    let lateMinutes = 0; let workHours = 0;
    if (action === "حضور") { lateMinutes = calculateLateMinutes(); } 
    else {
      const attTime = todayCheck.rows.find(x => x.action_type === "حضور");
      if (attTime) { const diffMs = new Date() - new Date(attTime.created_at); workHours = parseFloat((diffMs / 1000 / 60 / 60).toFixed(2)); }
    }
    const saved = await pool.query(`INSERT INTO attendance_logs (employee_id, branch_id, action_type, latitude, longitude, accuracy_m, distance_m, late_minutes, work_hours) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING created_at`, [employee.id, branch.id, action, lat, lng, accuracy, Math.round(dist), lateMinutes, workHours]);
    const when = new Date(saved.rows[0].created_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" });
    let msg = `تسجيل ${action}\n${employee.name} (${code})\n${branch.name}\nالمسافة: ${Math.round(dist)} متر\n`;
    if (action === "حضور" && lateMinutes > 0) msg += `متأخر: ${lateMinutes} دقيقة\n`;
    if (action === "انصراف") msg += `ساعات العمل: ${workHours} ساعة\n`;
    msg += when;
    await sendTelegram(msg);
    return res.json({ ok: true, message: `تم تسجيل ${action} بنجاح.` + (lateMinutes > 0 ? ` متأخر ${lateMinutes} دقيقة.` : ''), time: when, autoUpdated: false, lateMinutes, workHours });
  } catch (e) { console.error("Attendance error:", e); return res.status(500).json({ error: "حصل خطأ داخلي أثناء تسجيل البصمة." }); }
});

app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
  try {
    const today = await pool.query(`SELECT (SELECT COUNT(*) FROM employees WHERE active = true) AS total, (SELECT COUNT(DISTINCT employee_id) FROM attendance_logs WHERE action_type = 'حضور' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = (NOW() AT TIME ZONE 'Africa/Cairo')::date) AS present, (SELECT COUNT(DISTINCT employee_id) FROM attendance_logs WHERE action_type = 'انصراف' AND (created_at AT TIME ZONE 'Africa/Cairo')::date = (NOW() AT TIME ZONE 'Africa/Cairo')::date) AS leaved`);
    const t = today.rows[0];
    const absentList = await pool.query(`SELECT e.code, e.name FROM employees e WHERE e.active = true AND NOT EXISTS (SELECT 1 FROM attendance_logs l WHERE l.employee_id = e.id AND l.action_type = 'حضور' AND (l.created_at AT TIME ZONE 'Africa/Cairo')::date = (NOW() AT TIME ZONE 'Africa/Cairo')::date) ORDER BY e.name`);
    res.json({ total: Number(t.total), present: Number(t.present), leaved: Number(t.leaved), absent: Number(t.total) - Number(t.present), absentList: absentList.rows });
  } catch (e) { res.status(500).json({ error: "تعذر تحميل الإحصائيات" }); }
});

app.get("/api/admin/logs", requireAdmin, async (req, res) => {
  try {
    const from = cleanText(req.query.from, 10); const to = cleanText(req.query.to, 10); const params = []; const conditions = [];
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { params.push(from); conditions.push(`(l.created_at AT TIME ZONE 'Africa/Cairo')::date >= $${params.length}::date`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { params.push(to); conditions.push(`(l.created_at AT TIME ZONE 'Africa/Cairo')::date <= $${params.length}::date`); }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const r = await pool.query(`SELECT l.id, e.code, e.name AS employee, b.name AS branch, l.action_type, l.created_at, l.latitude, l.longitude, l.accuracy_m, l.distance_m, l.late_minutes, l.work_hours FROM attendance_logs l JOIN employees e ON e.id = l.employee_id JOIN branches b ON b.id = l.branch_id ${where} ORDER BY l.created_at DESC LIMIT 5000`, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: "تعذر تحميل سجل البصمات" }); }
});

app.get("/api/admin/employees", requireAdmin, async (_req, res) => {
  try { const r = await pool.query("SELECT id,code,name,active,salary FROM employees ORDER BY name"); res.json(r.rows); } catch (e) { res.status(500).json({ error: "تعذر تحميل الموظفين" }); }
});

app.post("/api/admin/employees", requireAdmin, async (req, res) => {
  const code = cleanText(req.body.code, 40); const name = cleanText(req.body.name, 100); const pin = String(req.body.pin || ""); const salary = Number(req.body.salary) || 0;
  if (!code || !name || pin.length < 4) return res.status(400).json({ error: "أدخل كود الموظف والاسم ورقمًا سريًا لا يقل عن 4 أحرف." });
  try {
    const hash = await bcrypt.hash(pin, 12);
    const r = await pool.query(`INSERT INTO employees (code, name, pin_hash, salary) VALUES ($1,$2,$3,$4) RETURNING id,code,name,active,salary`, [code, name, hash, salary]);
    res.json(r.rows[0]);
  } catch (e) { res.status(400).json({ error: "كود الموظف مستخدم بالفعل أو تعذر إنشاء الموظف." }); }
});

app.patch("/api/admin/employees/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || typeof req.body.active !== "boolean") return res.status(400).json({ error: "بيانات الموظف غير صحيحة." });
    const r = await pool.query(`UPDATE employees SET active = $1 WHERE id = $2 RETURNING id,code,name,active,salary`, [req.body.active, id]);
    if (!r.rowCount) return res.status(404).json({ error: "الموظف غير موجود." });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: "تعذر تعديل الموظف" }); }
});

app.patch("/api/admin/employees/:id/salary", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id); const salary = Number(req.body.salary);
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(salary) || salary < 0) return res.status(400).json({ error: "المرتب غير صحيح." });
    const r = await pool.query(`UPDATE employees SET salary = $1 WHERE id = $2 RETURNING id,code,name,active,salary`, [salary, id]);
    if (!r.rowCount) return res.status(404).json({ error: "الموظف غير موجود." });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: "تعذر تعديل المرتب" }); }
});

app.post("/api/admin/employees/:id/pin", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id); const pin = String(req.body.pin || "");
    if (!Number.isInteger(id) || id <= 0 || pin.length < 4) return res.status(400).json({ error: "الرقم السري يجب أن يكون 4 أحرف على الأقل." });
    const hash = await bcrypt.hash(pin, 12);
    const r = await pool.query("UPDATE employees SET pin_hash=$1 WHERE id=$2", [hash, id]);
    if (!r.rowCount) return res.status(404).json({ error: "الموظف غير موجود." });
    res.json({ ok: true, message: "تم تغيير الرقم السري للموظف بنجاح." });
  } catch (e) { res.status(500).json({ error: "تعذر تغيير الرقم السري" }); }
});

// ==================== تقرير شهري FIXED - الصافي = الإجمالي الصحيح بدون خصم مزدوج ====================
app.get("/api/admin/reports/monthly", requireAdmin, async (req, res) => {
  try {
    const month = cleanText(req.query.month, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "صيغة الشهر غير صحيحة YYYY-MM" });
    
    const r = await pool.query(`
      WITH daily AS (
        SELECT e.id as employee_id, e.code, e.name, e.salary,
          (l.created_at AT TIME ZONE 'Africa/Cairo')::date as work_date,
          MIN(l.created_at) FILTER (WHERE l.action_type='حضور') as first_in,
          MAX(l.created_at) FILTER (WHERE l.action_type='انصراف') as last_out,
          to_char(MIN(l.created_at) AT TIME ZONE 'Africa/Cairo', 'HH24:MI:SS') as first_in_cairo,
          to_char(MAX(l.created_at) AT TIME ZONE 'Africa/Cairo', 'HH24:MI:SS') as last_out_cairo
        FROM employees e
        LEFT JOIN attendance_logs l ON l.employee_id = e.id AND to_char(l.created_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM') = $1
        WHERE e.active = true GROUP BY e.id, e.code, e.name, e.salary, work_date
      )
      SELECT employee_id as id, code, name, salary, COUNT(work_date) as present_days,
        COALESCE(SUM(EXTRACT(EPOCH FROM (last_out - first_in))),0) as total_work_seconds,
        json_agg(json_build_object('date', work_date, 'first_in', first_in, 'last_out', last_out, 'first_in_cairo', first_in_cairo, 'last_out_cairo', last_out_cairo) ORDER BY work_date) FILTER (WHERE work_date IS NOT NULL) as daily_details
      FROM daily GROUP BY employee_id, code, name, salary ORDER BY name
    `, [month]);

    const data = r.rows.map(row => {
      let totalLateSeconds = 0;
      let lateDays = 0;
      const daily = (row.daily_details || []).map(d => {
        const firstIn = d.first_in ? new Date(d.first_in) : null;
        const lastOut = d.last_out ? new Date(d.last_out) : null;
        const inP = toCairoParts(firstIn);
        let lateInSec = 0;
        if(inP){
          if(inP.h > WORK_START_HOUR) lateInSec = (inP.h-WORK_START_HOUR)*3600+inP.m*60+inP.s;
          else if(inP.h===WORK_START_HOUR) lateInSec = inP.m*60+inP.s;
        }
        let workSec = 0;
        if(firstIn && lastOut) workSec = Math.max(0, Math.floor((lastOut-firstIn)/1000));
        if(lateInSec>0) lateDays++;
        totalLateSeconds+=lateInSec;
        
        return {
          date: d.date,
          work_date: d.date,
          first_in: d.first_in,
          last_out: d.last_out,
          first_in_cairo: d.first_in_cairo,
          last_out_cairo: d.last_out_cairo,
          حضور: d.first_in_cairo || '--',
          انصراف: d.last_out_cairo || '--',
          in: d.first_in_cairo,
          out: d.last_out_cairo,
          inT: d.first_in_cairo,
          outT: d.last_out_cairo,
          late: lateInSec>0?Math.floor(lateInSec/60):0,
          lateInSeconds: lateInSec,
          lateInHMS: formatHMS(lateInSec),
          seconds: workSec,
          hours_hms: formatHMS(workSec),
          hours: formatHMS(workSec),
          hours_decimal: workSec?parseFloat((workSec/3600).toFixed(2)):0
        };
      });
      
      const totalSeconds = parseFloat(row.total_work_seconds)||0;
      const salary = parseFloat(row.salary)||0;
      const dailyRate = salary/30;
      const hourlyRate = dailyRate/8;
      const minuteRate = hourlyRate/60;
      
      // FIX: الصافي = الإجمالي - بدون خصم مزدوج للعجز
      const netSeconds = totalSeconds;

      return {
        ...row,
        total_work_seconds: totalSeconds,
        total_work_hms: formatHMS(totalSeconds),
        total_work_hours: parseFloat((totalSeconds/3600).toFixed(2)),
        net_work_hms: formatHMS(netSeconds),
        net_work_seconds: netSeconds,
        total_late_seconds: totalLateSeconds,
        total_late_hms: formatHMS(totalLateSeconds),
        total_late_minutes: Math.floor(totalLateSeconds/60),
        total_shortage_hms: "00:00:00",
        present_days: parseInt(row.present_days)||0,
        late_days: lateDays,
        daily_details: daily,
        rates: { per_minute: parseFloat(minuteRate.toFixed(2)), per_hour: parseFloat(hourlyRate.toFixed(2)), per_day: parseFloat(dailyRate.toFixed(2)) },
        deserved_salary: parseFloat((Math.floor(totalSeconds/60)*minuteRate).toFixed(2)),
        net_salary: parseFloat((Math.floor(netSeconds/60)*minuteRate).toFixed(2)),
        صافي: parseFloat((Math.floor(netSeconds/60)*minuteRate).toFixed(2)),
        مستحق: parseFloat((Math.floor(totalSeconds/60)*minuteRate).toFixed(2)),
        إجمالي: formatHMS(totalSeconds)
      };
    });
    res.json({ month, workConfig: { start: `${WORK_START_HOUR}:00`, end: `${WORK_END_HOUR}:00`, hours: 8 }, data });
  } catch (e) { console.error(e); res.status(500).json({ error: "تعذر تحميل التقرير الشهري" }); }
});

app.get("/api/admin/branches", requireAdmin, async (_req, res) => {
  try { const r = await pool.query(`SELECT id,name,latitude,longitude,radius_m,active FROM branches ORDER BY name`); res.json(r.rows); } catch (e) { res.status(500).json({ error: "تعذر تحميل الفروع" }); }
});

app.patch("/api/admin/branches/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id); const name = cleanText(req.body.name, 120);
    const lat = req.body.latitude === "" || req.body.latitude == null ? null : Number(req.body.latitude);
    const lng = req.body.longitude === "" || req.body.longitude == null ? null : Number(req.body.longitude);
    const requestedRadius = Number(req.body.radius_m); const radius = Math.min(MAX_RADIUS_M, requestedRadius);
    if (!Number.isInteger(id) || id <= 0 || !name || !Number.isFinite(requestedRadius) || requestedRadius < 30 || (lat === null) !== (lng === null) || (lat !== null && !validCoordinates(lat, lng))) return res.status(400).json({ error: "بيانات الفرع أو الإحداثيات غير صحيحة." });
    const r = await pool.query(`UPDATE branches SET name=$1, latitude=$2, longitude=$3, radius_m=$4, active=$5 WHERE id=$6 RETURNING *`, [name, lat, lng, radius, req.body.active !== false, id]);
    if (!r.rowCount) return res.status(404).json({ error: "الفرع غير موجود." });
    res.json(r.rows[0]);
  } catch (e) { res.status(400).json({ error: "تعذر تعديل الفرع. تأكد من عدم تكرار اسم فرع آخر." }); }
});

app.post("/api/admin/branches", requireAdmin, async (req, res) => {
  try {
    const name = cleanText(req.body.name, 120); const lat = Number(req.body.latitude); const lng = Number(req.body.longitude); const requestedRadius = Number(req.body.radius_m || MAX_RADIUS_M);
    if (!name || !validCoordinates(lat, lng) || !Number.isFinite(requestedRadius) || requestedRadius < 30) return res.status(400).json({ error: "أدخل اسم الفرع وإحداثيات صحيحة ونطاقًا لا يقل عن 30 مترًا." });
    const radius = Math.min(MAX_RADIUS_M, requestedRadius);
    const r = await pool.query(`INSERT INTO branches (name,latitude,longitude,radius_m) VALUES ($1,$2,$3,$4) RETURNING *`, [name, lat, lng, radius]);
    res.json(r.rows[0]);
  } catch (e) { res.status(400).json({ error: "تعذر إضافة الفرع. ربما الاسم مستخدم بالفعل." }); }
});

app.get("/api/admin/export.csv", requireAdmin, async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
        e.code as "كود الموظف",
        e.name AS "اسم الموظف",
        b.name AS "الفرع",
        l.action_type AS "نوع التسجيل",
        (l.created_at AT TIME ZONE 'Africa/Cairo')::text AS "التاريخ والوقت",
        l.late_minutes AS "تأخير دقايق",
        l.work_hours AS "ساعات عمل",
        l.distance_m AS "المسافة"
      FROM attendance_logs l 
      JOIN employees e ON e.id = l.employee_id 
      JOIN branches b ON b.id = l.branch_id 
      ORDER BY l.created_at DESC
    `);
    if(!r.rows.length) return res.status(404).send("مفيش بيانات");
    const cols = Object.keys(r.rows[0]);
    const header = cols.join(";");
    const csvRows = r.rows.map(row => cols.map(k => `"${String(row[k] ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const csv = "sep=;\r\n" + header + "\r\n" + csvRows;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="furqan-attendance.csv"');
    res.send("\uFEFF" + csv);
  } catch (e) { 
    console.error(e);
    res.status(500).json({ error: "تعذر تصدير السجل" }); 
  }
});

app.get("/admin", (_req, res) => { res.sendFile(path.join(__dirname, "public", "admin.html")); });
app.get("*", (_req, res) => { res.sendFile(path.join(__dirname, "public", "index.html")); });

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Furqan app listening on ${PORT}`);
    console.log(`Maximum attendance radius: ${MAX_RADIUS_M} meters`);
  });
}).catch(e => { console.error("Database initialization failed:", e); process.exit(1); });