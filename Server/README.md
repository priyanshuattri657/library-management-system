# LibraTrack API

REST backend for the Library Management System frontend, using Node.js + Express + MySQL.

## 1. Install dependencies

```
cd server
npm install
```

## 2. Set up the database

Make sure MySQL is running, then:

```
mysql -u root -p < schema.sql
mysql -u root -p library_db < seed.sql
```

This creates the `library_db` database with `books`, `members`, and `transactions`
tables, and loads the same demo data the frontend prototype ships with.

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

## 5. Test the endpoints

| Method | Endpoint                        | Description                        |
|--------|----------------------------------|-------------------------------------|
| GET    | /api/books                       | List all books                     |
| POST   | /api/books                       | Add a book                         |
| PUT    | /api/books/:id                   | Update a book                      |
| DELETE | /api/books/:id                   | Delete a book                      |
| GET    | /api/members                     | List members (with active issues) |
| POST   | /api/members                     | Add a member                       |
| PUT    | /api/members/:id                 | Update a member                    |
| DELETE | /api/members/:id                 | Delete a member (blocked if active issues) |
| GET    | /api/transactions                | List all transactions with live status/fine |
| POST   | /api/transactions/issue          | Issue a book `{ bookId, memberId, issueDate, dueDate }` |
| POST   | /api/transactions/:id/return     | Return a book, calculates fine automatically |

Try `GET http://localhost:5000/api/books` in your browser once the server is running.

## 6. Connect the frontend

In `script.js`, the `Store` object is the only place that touches data. Replace each
method's body with a `fetch()` call to the matching endpoint above — for example:

```js
async getBooks() {
  const res = await fetch("http://localhost:5000/api/books");
  return res.json();
}
```

Every place in the UI code that calls `Store.getBooks()` etc. stays exactly the same;
you're only swapping what happens inside `Store`. Because `fetch` is asynchronous, the
call sites will need `await` in front of them once you make this change (currently they
call `Store` synchronously against localStorage).
