-- =========================================================
-- LibraTrack — database schema
-- Run this once to create the database and tables:
--   mysql -u root -p < schema.sql
-- =========================================================

CREATE DATABASE IF NOT EXISTS library_db;
USE library_db;

CREATE TABLE IF NOT EXISTS books (
  id           VARCHAR(20)  PRIMARY KEY,
  title        VARCHAR(255) NOT NULL,
  author       VARCHAR(255) NOT NULL,
  isbn         VARCHAR(20)  NOT NULL UNIQUE,
  category     VARCHAR(100) NOT NULL,
  publisher    VARCHAR(150) NOT NULL,
  year         INT          NOT NULL,
  total_qty    INT          NOT NULL,
  avail_qty    INT          NOT NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
  id           VARCHAR(20)  PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  email        VARCHAR(150) NOT NULL UNIQUE,
  phone        VARCHAR(15)  NOT NULL,
  course       VARCHAR(150) NOT NULL,
  semester     INT          NOT NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id           VARCHAR(30)  PRIMARY KEY,
  book_id      VARCHAR(20)  NOT NULL,
  member_id    VARCHAR(20)  NOT NULL,
  issue_date   DATE         NOT NULL,
  due_date     DATE         NOT NULL,
  return_date  DATE         NULL,
  status       ENUM('Issued', 'Returned') NOT NULL DEFAULT 'Issued',
  fine         INT          NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id)   REFERENCES books(id)   ON DELETE RESTRICT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT
);

CREATE INDEX idx_txn_book   ON transactions(book_id);
CREATE INDEX idx_txn_member ON transactions(member_id);
CREATE INDEX idx_txn_status ON transactions(status);
