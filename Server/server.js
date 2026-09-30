require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { testConnection } = require("./config/db");

const booksRoutes = require("./routes/books");
const membersRoutes = require("./routes/members");
const transactionsRoutes = require("./routes/transactions");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/books", booksRoutes);
app.use("/api/members", membersRoutes);
app.use("/api/transactions", transactionsRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`LibraTrack API running on http://localhost:${PORT}`);
  await testConnection();
});
