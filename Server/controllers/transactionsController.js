const { pool } = require("../config/db");

const FINE_PER_DAY = 5;

// GET /api/transactions
// Joins book + member details and computes a live "Overdue" status,
// the same way the frontend does, so the client never has to guess.
async function getTransactions(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT
        t.id, t.book_id, t.member_id, t.issue_date, t.due_date, t.return_date, t.status, t.fine,
        b.title AS book_title, b.author AS book_author,
        m.name  AS member_name,
        CASE
          WHEN t.status = 'Returned' THEN 'Returned'
          WHEN t.due_date < CURDATE() THEN 'Overdue'
          ELSE 'Issued'
        END AS effective_status,
        CASE
          WHEN t.status = 'Returned' THEN t.fine
          WHEN t.due_date < CURDATE() THEN GREATEST(0, DATEDIFF(CURDATE(), t.due_date)) * ${FINE_PER_DAY}
          ELSE 0
        END AS current_fine
      FROM transactions t
      JOIN books b   ON b.id = t.book_id
      JOIN members m ON m.id = t.member_id
      ORDER BY t.issue_date DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transactions.", detail: err.message });
  }
}

// POST /api/transactions/issue
// Body: { id, bookId, memberId, issueDate, dueDate }
async function issueBook(req, res) {
  const { id, bookId, memberId, issueDate, dueDate } = req.body;
  const errors = {};

  if (!bookId) errors.bookId = "Select a book to issue.";
  if (!memberId) errors.memberId = "Select a valid member.";
  if (!issueDate) errors.issueDate = "Issue date is required.";
  if (!dueDate) errors.dueDate = "Due date is required.";
  else if (issueDate && dueDate < issueDate) errors.dueDate = "Due date cannot be before the issue date.";
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [members] = await conn.query("SELECT id FROM members WHERE id = ?", [memberId]);
    if (!members.length) {
      await conn.rollback();
      return res.status(400).json({ errors: { memberId: "This member does not exist." } });
    }

    const [books] = await conn.query("SELECT * FROM books WHERE id = ? FOR UPDATE", [bookId]);
    if (!books.length) {
      await conn.rollback();
      return res.status(400).json({ errors: { bookId: "This book does not exist." } });
    }
    const book = books[0];
    if (book.avail_qty <= 0) {
      await conn.rollback();
      return res.status(409).json({ errors: { bookId: "No copies available for this book." } });
    }

    const txnId = id || "TXN" + Date.now();
    await conn.query(
      "INSERT INTO transactions (id, book_id, member_id, issue_date, due_date, status, fine) VALUES (?, ?, ?, ?, ?, 'Issued', 0)",
      [txnId, bookId, memberId, issueDate, dueDate]
    );
    await conn.query("UPDATE books SET avail_qty = avail_qty - 1 WHERE id = ?", [bookId]);

    await conn.commit();
    res.status(201).json({ message: "Book issued successfully.", id: txnId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: "Failed to issue book.", detail: err.message });
  } finally {
    conn.release();
  }
}

// POST /api/transactions/:id/return
async function returnBook(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [txns] = await conn.query("SELECT * FROM transactions WHERE id = ? FOR UPDATE", [id]);
    if (!txns.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Transaction not found." });
    }
    const txn = txns[0];
    if (txn.status === "Returned") {
      await conn.rollback();
      return res.status(409).json({ error: "This book has already been returned." });
    }

    const [[{ overdueDays }]] = await conn.query(
      "SELECT GREATEST(0, DATEDIFF(CURDATE(), ?)) AS overdueDays", [txn.due_date]
    );
    const fine = overdueDays * FINE_PER_DAY;

    await conn.query(
      "UPDATE transactions SET status='Returned', return_date=CURDATE(), fine=? WHERE id=?",
      [fine, id]
    );
    await conn.query("UPDATE books SET avail_qty = avail_qty + 1 WHERE id = ?", [txn.book_id]);

    await conn.commit();
    res.json({ message: fine > 0 ? `Book returned. Overdue fine: ₹${fine}.` : "Book returned successfully.", fine });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: "Failed to process return.", detail: err.message });
  } finally {
    conn.release();
  }
}

module.exports = { getTransactions, issueBook, returnBook };
