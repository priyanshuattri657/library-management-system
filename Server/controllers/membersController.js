const { pool } = require("../config/db");

function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isValidPhone(v) { return /^\d{10}$/.test(String(v).replace(/\D/g, "")); }

// GET /api/members
async function getMembers(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT m.*, COUNT(t.id) AS active_issues
      FROM members m
      LEFT JOIN transactions t ON t.member_id = m.id AND t.status = 'Issued'
      GROUP BY m.id
      ORDER BY m.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch members.", detail: err.message });
  }
}

// POST /api/members
async function createMember(req, res) {
  const { id, name, email, phone, course, semester } = req.body;
  const errors = {};

  if (!id) errors.id = "Member ID is required.";
  if (!name) errors.name = "Name is required.";
  if (!email) errors.email = "Email is required.";
  else if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
  if (!phone) errors.phone = "Phone is required.";
  else if (!isValidPhone(phone)) errors.phone = "Enter a valid 10-digit phone number.";
  if (!course) errors.course = "Course/Department is required.";
  if (!semester || semester < 1 || semester > 8) errors.semester = "Semester must be between 1 and 8.";

  if (Object.keys(errors).length) return res.status(400).json({ errors });

  try {
    const [dupId] = await pool.query("SELECT id FROM members WHERE id = ?", [id]);
    if (dupId.length) return res.status(409).json({ errors: { id: "This Member ID already exists." } });

    const [dupEmail] = await pool.query("SELECT id FROM members WHERE email = ?", [email]);
    if (dupEmail.length) return res.status(409).json({ errors: { email: "This email is already registered." } });

    await pool.query(
      "INSERT INTO members (id, name, email, phone, course, semester) VALUES (?, ?, ?, ?, ?, ?)",
      [id, name, email, phone, course, semester]
    );
    res.status(201).json({ message: "Member added successfully.", id });
  } catch (err) {
    res.status(500).json({ error: "Failed to add member.", detail: err.message });
  }
}

// PUT /api/members/:id
async function updateMember(req, res) {
  const { id } = req.params;
  const { name, email, phone, course, semester } = req.body;
  const errors = {};

  if (!name) errors.name = "Name is required.";
  if (!email) errors.email = "Email is required.";
  else if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
  if (!phone) errors.phone = "Phone is required.";
  else if (!isValidPhone(phone)) errors.phone = "Enter a valid 10-digit phone number.";
  if (!course) errors.course = "Course/Department is required.";
  if (!semester || semester < 1 || semester > 8) errors.semester = "Semester must be between 1 and 8.";

  if (Object.keys(errors).length) return res.status(400).json({ errors });

  try {
    const [existing] = await pool.query("SELECT id FROM members WHERE id = ?", [id]);
    if (!existing.length) return res.status(404).json({ error: "Member not found." });

    const [dupEmail] = await pool.query("SELECT id FROM members WHERE email = ? AND id != ?", [email, id]);
    if (dupEmail.length) return res.status(409).json({ errors: { email: "This email is already registered." } });

    await pool.query(
      "UPDATE members SET name=?, email=?, phone=?, course=?, semester=? WHERE id=?",
      [name, email, phone, course, semester, id]
    );
    res.json({ message: "Member updated successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to update member.", detail: err.message });
  }
}

// DELETE /api/members/:id
async function deleteMember(req, res) {
  const { id } = req.params;
  try {
    const [active] = await pool.query("SELECT id FROM transactions WHERE member_id = ? AND status = 'Issued'", [id]);
    if (active.length) {
      return res.status(409).json({ error: `Cannot delete a member with ${active.length} active issued book(s).` });
    }
    const [result] = await pool.query("DELETE FROM members WHERE id = ?", [id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Member not found." });
    res.json({ message: "Member deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete member.", detail: err.message });
  }
}

module.exports = { getMembers, createMember, updateMember, deleteMember };
