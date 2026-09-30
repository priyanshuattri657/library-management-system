// =========================================================
// Database connection pool.
// A pool is reused across requests instead of opening a new
// connection every time — every controller imports `pool`
// from here and calls pool.query(...) / pool.execute(...).
// =========================================================

require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "library_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true, // return DATE columns as 'YYYY-MM-DD' strings, matching the frontend's format
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log("✓ Connected to MySQL database:", process.env.DB_NAME || "library_db");
    conn.release();
  } catch (err) {
    console.error("✗ Could not connect to MySQL:", err.message);
    console.error("  Check your .env file and confirm MySQL is running.");
  }
}

module.exports = { pool, testConnection };
