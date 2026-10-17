require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

(async () => {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });
  const hash = await bcrypt.hash('Admin@12345678', 10);
  await pool.query("DELETE FROM admins WHERE username='admin'");
  await pool.query("INSERT INTO admins(username,password) VALUES($1,$2)", ['admin', hash]);
  console.log("DONE");
  await pool.end();
})();