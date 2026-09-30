const express = require("express");
const router = express.Router();
const { getTransactions, issueBook, returnBook } = require("../controllers/transactionsController");

router.get("/", getTransactions);
router.post("/issue", issueBook);
router.post("/:id/return", returnBook);

module.exports = router;
