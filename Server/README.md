# LibraTrack API

REST backend for the Library Management System frontend, using Node.js + Express + MySQL.

## 1. Install dependencies

```
cd Server
npm install
```

## 2. Set up the database

Make sure MySQL is running, then:

```
mysql -u root -p < schema.sql
mysql -u root -p library_db < seed.sql
```

This creates the `library_db` database with `books`, `members`, and `transactions`
tables, and loads the demo data.

## 3. Configure environment variables

```
cp .env.example .env
```

Then open `.env` and set `DB_PASSWORD` (and `DB_USER` if you're not using `root`).

## 4. Run the server

```
npm run dev
```

You should see:

```
LibraTrack API running on http://localhost:5000
✓ Connected to MySQL database: library_db
```

## 5. API Endpoints

| Method | Endpoint                        | Description                        |
|--------|----------------------------------|-------------------------------------|
| GET    | /api/books                       | List all books                     |
| POST   | /api/books                       | Add a book                         |
| PUT    | /api/books/:id                   | Update a book                      |
| DELETE | /api/books/:id                   | Delete a book                      |
| GET    | /api/members                     | List members (with active issues)  |
| POST   | /api/members                     | Add a member                       |
| PUT    | /api/members/:id                 | Update a member                    |
| DELETE | /api/members/:id                 | Delete a member (blocked if active issues) |
| GET    | /api/transactions                | List all transactions with live status/fine |
| POST   | /api/transactions/issue          | Issue a book `{ bookId, memberId, issueDate, dueDate }` |
| POST   | /api/transactions/:id/return     | Return a book, calculates fine automatically |

Try `GET http://localhost:5000/api/books` in your browser once the server is running.

## 6. Connect the frontend

The frontend (`script.js`) already calls this API at `http://localhost:5000/api`.
Start the server, then open `index.html` in your browser.