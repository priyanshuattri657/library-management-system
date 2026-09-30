const { pool } = require("../config/db");

function isValidISBN(v) {
  const digits = String(v).replace(/[-\s]/g, "");
  return /^\d{10}$/.test(digits) || /^\d{13}$/.test(digits);
}

// GET /api/books
async function getBooks(req, res) {
  try {
    const [rows] = await pool.query("SELECT * FROM books ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch books.", detail: err.message });
  }
}

// POST /api/books
async function createBook(req, res) {
  const { id, title, author, isbn, category, publisher, year, totalQty, availQty } = req.body;
  const errors = {};

  if (!id) errors.id = "Book ID is required.";
  if (!title) errors.title = "Title is required.";
  if (!author) errors.author = "Author is required.";
  if (!isbn) errors.isbn = "ISBN is required.";
  else if (!isValidISBN(isbn)) errors.isbn = "Enter a valid 10 or 13 digit ISBN.";
  if (!category) errors.category = "Category is required.";
  if (!publisher) errors.publisher = "Publisher is required.";
  if (!year || year < 1900 || year > 2026) errors.year = "Enter a valid publication year.";
  if (!totalQty || totalQty <= 0) errors.totalQty = "Quantity must be greater than 0.";
  if (availQty === undefined || availQty === null || availQty < 0) errors.availQty = "Available copies cannot be negative.";
  else if (totalQty && availQty > totalQty) errors.availQty = "Available copies cannot exceed total quantity.";

  if (Object.keys(errors).length) return res.status(400).json({ errors });

  try {
    const [dupId] = await pool.query("SELECT id FROM books WHERE id = ?", [id]);
    if (dupId.length) return res.status(409).json({ errors: { id: "This Book ID already exists." } });

    const [dupIsbn] = await pool.query("SELECT id FROM books WHERE isbn = ?", [isbn.replace(/[-\s]/g, "")]);
    if (dupIsbn.length) return res.status(409).json({ errors: { isbn: "This ISBN already exists." } });

    await pool.query(
      `INSERT INTO books (id, title, author, isbn, category, publisher, year, total_qty, avail_qty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, author, isbn.replace(/[-\s]/g, ""), category, publisher, year, totalQty, availQty]
    );
    res.status(201).json({ message: "Book added successfully.", id });
  } catch (err) {
    res.status(500).json({ error: "Failed to add book.", detail: err.message });
  }
}

// PUT /api/books/:id
async function updateBook(req, res) {
  const { id } = req.params;
  const { title, author, isbn, category, publisher, year, totalQty, availQty } = req.body;
  const errors = {};

  if (!title) errors.title = "Title is required.";
  if (!author) errors.author = "Author is required.";
  if (!isbn) errors.isbn = "ISBN is required.";
  else if (!isValidISBN(isbn)) errors.isbn = "Enter a valid 10 or 13 digit ISBN.";
  if (!category) errors.category = "Category is required.";
  if (!publisher) errors.publisher = "Publisher is required.";
  if (!year || year < 1900 || year > 2026) errors.year = "Enter a valid publication year.";
  if (!totalQty || totalQty <= 0) errors.totalQty = "Quantity must be greater than 0.";
  if (availQty === undefined || availQty === null || availQty < 0) errors.availQty = "Available copies cannot be negative.";
  else if (totalQty && availQty > totalQty) errors.availQty = "Available copies cannot exceed total quantity.";

  if (Object.keys(errors).length) return res.status(400).json({ errors });

  try {
    const [existing] = await pool.query("SELECT id FROM books WHERE id = ?", [id]);
    if (!existing.length) return res.status(404).json({ error: "Book not found." });

    const [dupIsbn] = await pool.query("SELECT id FROM books WHERE isbn = ? AND id != ?", [isbn.replace(/[-\s]/g, ""), id]);
    if (dupIsbn.length) return res.status(409).json({ errors: { isbn: "This ISBN already exists." } });

    await pool.query(
      `UPDATE books SET title=?, author=?, isbn=?, category=?, publisher=?, year=?, total_qty=?, avail_qty=? WHERE id=?`,
      [title, author, isbn.replace(/[-\s]/g, ""), category, publisher, year, totalQty, availQty, id]
    );
    res.json({ message: "Book updated successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to update book.", detail: err.message });
  }
}

// DELETE /api/books/:id
async function deleteBook(req, res) {
  const { id } = req.params;
  try {
    const [active] = await pool.query("SELECT id FROM transactions WHERE book_id = ? AND status = 'Issued'", [id]);
    if (active.length) return res.status(409).json({ error: "Cannot delete a book that is currently issued." });

    const [result] = await pool.query("DELETE FROM books WHERE id = ?", [id]);
    if (!result.affectedRows) return res.status(404).json({ error: "Book not found." });
    res.json({ message: "Book deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete book.", detail: err.message });
  }
}

module.exports = { getBooks, createBook, updateBook, deleteBook };
