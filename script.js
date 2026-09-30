/* =========================================================
   LibraTrack — Library Management System
   Frontend, connected to the Node.js + Express + MySQL backend.

   DATA LAYER NOTE
   ------------------------------------------------
   `Api` talks to the REST backend (http://localhost:5000/api/...).
   Because dozens of render functions read data synchronously,
   we keep an in-memory cache (`Cache`) that mirrors the database.
   `Store.getBooks()/getMembers()/getTxns()` just read that cache
   instantly — no render code had to change. Anything that WRITES
   data calls `Api.*`, then `refreshCache()`, then re-renders.
   ========================================================= */

(function () {
  "use strict";

  /* =========================================================
     1. API CLIENT + IN-MEMORY CACHE
     ========================================================= */
  const API_BASE = "http://localhost:5000/api";

  async function apiRequest(path, options) {
    let res;
    try {
      res = await fetch(API_BASE + path, options);
    } catch (networkErr) {
      const err = new Error("Could not reach the server. Make sure the backend (npm run dev) is running on http://localhost:5000.");
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* no JSON body, e.g. some errors */ }
    if (!res.ok) {
      const err = new Error((data && (data.error || "Request failed.")) || "Request failed.");
      err.errors = data && data.errors;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const JSON_HEADERS = { "Content-Type": "application/json" };

  function mapBook(row) {
    return {
      id: row.id, title: row.title, author: row.author, isbn: row.isbn,
      category: row.category, publisher: row.publisher, year: row.year,
      totalQty: row.total_qty, availQty: row.avail_qty,
    };
  }
  function mapMember(row) {
    return { id: row.id, name: row.name, email: row.email, phone: row.phone, course: row.course, semester: row.semester };
  }
  function mapTxn(row) {
    return {
      id: row.id, bookId: row.book_id, memberId: row.member_id,
      issueDate: row.issue_date, dueDate: row.due_date, returnDate: row.return_date,
      status: row.status, fine: row.fine,
    };
  }

  const Api = {
    getBooks: () => apiRequest("/books").then((rows) => rows.map(mapBook)),
    addBook: (book) => apiRequest("/books", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(book) }),
    updateBook: (id, book) => apiRequest("/books/" + id, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(book) }),
    deleteBook: (id) => apiRequest("/books/" + id, { method: "DELETE" }),

    getMembers: () => apiRequest("/members").then((rows) => rows.map(mapMember)),
    addMember: (m) => apiRequest("/members", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(m) }),
    updateMember: (id, m) => apiRequest("/members/" + id, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(m) }),
    deleteMember: (id) => apiRequest("/members/" + id, { method: "DELETE" }),

    getTxns: () => apiRequest("/transactions").then((rows) => rows.map(mapTxn)),
    issueBook: (payload) => apiRequest("/transactions/issue", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(payload) }),
    returnTxn: (id) => apiRequest("/transactions/" + id + "/return", { method: "POST" }),
  };

  // In-memory mirror of the database, refreshed after every write.
  const Cache = { books: [], members: [], txns: [] };

  async function refreshCache() {
    const [books, members, txns] = await Promise.all([Api.getBooks(), Api.getMembers(), Api.getTxns()]);
    Cache.books = books;
    Cache.members = members;
    Cache.txns = txns;
  }

  // Read-only, synchronous — every existing render function keeps working unchanged.
  const Store = {
    getBooks() { return Cache.books; },
    getMembers() { return Cache.members; },
    getTxns() { return Cache.txns; },
  };

  // Maps a server { errors: { field: message } } response onto the on-screen form fields.
  function applyServerErrors(errors, fieldMap) {
    if (!errors) return;
    Object.keys(errors).forEach((key) => {
      const inputId = fieldMap[key];
      if (inputId) setFieldError(inputId, errors[key]);
    });
  }

  /* =========================================================
     3. UTILITIES
     ========================================================= */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (iso) => {
    if (!iso) return "—";
    const dt = new Date(iso + "T00:00:00");
    return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function computeFine(dueDate, returnOrToday) {
    const overdueDays = daysBetween(dueDate, returnOrToday);
    return overdueDays > 0 ? overdueDays * 5 : 0;
  }
  function effectiveStatus(t) {
    if (t.status === "Returned") return "Returned";
    return daysBetween(t.dueDate, todayStr()) > 0 ? "Overdue" : "Issued";
  }

  /* =========================================================
     4. TOASTS
     ========================================================= */
  const ICONS = {
    success: '<svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
    error: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2zm0-4h-2V7h2z"/></svg>',
    warning: '<svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2zm0-4h-2v-4h2z"/></svg>',
  };
  function toast(message, type) {
    type = type || "success";
    const stack = $("#toastStack");
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.innerHTML =
      '<span class="toast-icon">' + ICONS[type] + '</span>' +
      '<span class="toast-msg">' + escapeHtml(message) + '</span>' +
      '<button class="toast-close" aria-label="Dismiss">&times;</button>';
    el.querySelector(".toast-close").addEventListener("click", () => el.remove());
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  /* =========================================================
     5. MODALS
     ========================================================= */
  const backdrop = $("#modalBackdrop");
  function openModal(id) {
    backdrop.classList.add("show");
    $$(".modal", backdrop).forEach((m) => m.classList.remove("show"));
    $("#" + id).classList.add("show");
  }
  function closeModal() {
    backdrop.classList.remove("show");
    $$(".modal", backdrop).forEach((m) => m.classList.remove("show"));
  }
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  $$("[data-close-modal]").forEach((btn) => btn.addEventListener("click", closeModal));

  function confirmAction(text, onConfirm, title) {
    $("#confirmModalTitle").textContent = title || "Are you sure?";
    $("#confirmModalText").textContent = text;
    openModal("confirmModal");
    const okBtn = $("#confirmModalOk");
    const handler = () => { onConfirm(); closeModal(); okBtn.removeEventListener("click", handler); };
    okBtn.replaceWith(okBtn.cloneNode(true)); // clear old listeners
    $("#confirmModalOk").addEventListener("click", handler);
  }

  function showDetails(title, rows) {
    $("#detailsModalTitle").textContent = title;
    $("#detailsModalBody").innerHTML = rows
      .map((r) => '<div class="detail-row"><span class="k">' + escapeHtml(r[0]) + '</span><span class="v">' + escapeHtml(r[1]) + '</span></div>')
      .join("");
    openModal("detailsModal");
  }

  /* =========================================================
     6. FORM VALIDATION HELPERS
     ========================================================= */
  function setFieldError(inputId, message) {
    const input = $("#" + inputId);
    const errEl = $('.field-error[data-for="' + inputId + '"]');
    const field = input ? input.closest(".field") : null;
    if (errEl) errEl.textContent = message || "";
    if (field) field.classList.toggle("invalid", !!message);
  }
  function clearErrors(ids) { ids.forEach((id) => setFieldError(id, "")); }
  function isValidISBN(v) {
    const digits = v.replace(/[-\s]/g, "");
    return /^\d{10}$/.test(digits) || /^\d{13}$/.test(digits);
  }
  function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function isValidPhone(v) { return /^\d{10}$/.test(v.replace(/\D/g, "")); }

  /* =========================================================
     7. NAVIGATION
     ========================================================= */
  function switchView(name) {
    $$(".view").forEach((v) => v.classList.remove("active"));
    $("#view-" + name).classList.add("active");
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    if ($("#sidebar").classList.contains("open")) closeSidebar();
    renderAll();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  $$(".nav-item").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));

  function openSidebar() { $("#sidebar").classList.add("open"); $("#sidebarScrim").classList.add("show"); }
  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sidebarScrim").classList.remove("show"); }
  $("#menuToggle").addEventListener("click", openSidebar);
  $("#sidebarScrim").addEventListener("click", closeSidebar);

  /* =========================================================
     8. DASHBOARD
     ========================================================= */
  function renderDashboard() {
    const books = Store.getBooks();
    const members = Store.getMembers();
    const txns = Store.getTxns();

    const totalBooks = books.reduce((s, b) => s + b.totalQty, 0);
    const availableBooks = books.reduce((s, b) => s + b.availQty, 0);
    const issuedTxns = txns.filter((t) => effectiveStatus(t) !== "Returned");
    const overdueTxns = txns.filter((t) => effectiveStatus(t) === "Overdue");

    const cards = [
      { label: "Total Books", value: totalBooks, icon: "blue", svg: '<path d="M6 2h13a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>' },
      { label: "Available Books", value: availableBooks, icon: "green", svg: '<path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' },
      { label: "Issued Books", value: issuedTxns.length, icon: "ink", svg: '<path d="M20 6h-4l-2-2h-4L8 6H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/>' },
      { label: "Overdue Books", value: overdueTxns.length, icon: "red", svg: '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2zm0-4h-2v-4h2z"/>' },
      { label: "Total Members", value: members.length, icon: "blue", svg: '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3z"/>' },
      { label: "Total Transactions", value: txns.length, icon: "orange", svg: '<path d="M9 3v2H4v2h1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7h1V5h-5V3H9z"/>' },
    ];
    $("#statGrid").innerHTML = cards.map((c) =>
      '<div class="stat-card"><div class="stat-icon ' + c.icon + '"><svg viewBox="0 0 24 24">' + c.svg + '</svg></div>' +
      '<div class="stat-value">' + c.value + '</div><div class="stat-label">' + c.label + '</div></div>'
    ).join("");

    $("#notifDot").hidden = overdueTxns.length === 0;

    drawCategoryChart(books);
    drawActivityChart(txns);
    renderMostBorrowed(books, txns);
    renderRecentActivity(books, members, txns);
  }

  function drawCategoryChart(books) {
    const canvas = $("#chartCategory");
    const ctx = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 420, h = 220;
    canvas.width = w * ratio; canvas.height = h * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const byCat = {};
    books.forEach((b) => { byCat[b.category] = (byCat[b.category] || 0) + b.totalQty; });
    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!entries.length) return;
    const max = Math.max(...entries.map((e) => e[1]));
    const padL = 10, padR = 10, padTop = 10, barH = 22, gap = 14;
    entries.forEach((e, i) => {
      const y = padTop + i * (barH + gap);
      const barMaxW = w - padL - padR - 110;
      const barW = Math.max(4, (e[1] / max) * barMaxW);
      ctx.fillStyle = "#64748b";
      ctx.font = "12px Inter, sans-serif";
      ctx.textBaseline = "middle";
      const label = e[0].length > 16 ? e[0].slice(0, 15) + "…" : e[0];
      ctx.fillText(label, padL, y + barH / 2);
      ctx.fillStyle = "#eff6ff";
      ctx.fillRect(padL + 100, y, barMaxW, barH);
      ctx.fillStyle = "#2563eb";
      ctx.fillRect(padL + 100, y, barW, barH);
      ctx.fillStyle = "#0f172a";
      ctx.font = "600 12px Inter, sans-serif";
      ctx.fillText(String(e[1]), padL + 100 + barW + 8, y + barH / 2);
    });
  }

  function drawActivityChart(txns) {
    const canvas = $("#chartActivity");
    const ctx = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 420, h = 220;
    canvas.width = w * ratio; canvas.height = h * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      days.push(dt.toISOString().slice(0, 10));
    }
    const issuedCount = days.map((d) => txns.filter((t) => t.issueDate === d).length);
    const returnedCount = days.map((d) => txns.filter((t) => t.returnDate === d).length);
    const max = Math.max(1, ...issuedCount, ...returnedCount);

    const padL = 30, padB = 24, padTop = 16, padR = 10;
    const plotW = w - padL - padR, plotH = h - padB - padTop;
    const colW = plotW / days.length;

    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath(); ctx.moveTo(padL, padTop); ctx.lineTo(padL, padTop + plotH); ctx.lineTo(padL + plotW, padTop + plotH); ctx.stroke();

    days.forEach((d, i) => {
      const x0 = padL + i * colW;
      const bw = colW * 0.3;
      const hIssued = (issuedCount[i] / max) * plotH;
      const hReturned = (returnedCount[i] / max) * plotH;
      ctx.fillStyle = "#2563eb";
      ctx.fillRect(x0 + colW * 0.18, padTop + plotH - hIssued, bw, hIssued);
      ctx.fillStyle = "#16a34a";
      ctx.fillRect(x0 + colW * 0.52, padTop + plotH - hReturned, bw, hReturned);
      ctx.fillStyle = "#64748b";
      ctx.font = "10.5px Inter, sans-serif";
      ctx.textAlign = "center";
      const lbl = new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      ctx.fillText(lbl, x0 + colW / 2, padTop + plotH + 15);
    });
    ctx.textAlign = "left";

    // legend
    ctx.fillStyle = "#2563eb"; ctx.fillRect(padL, 0, 9, 9);
    ctx.fillStyle = "#334155"; ctx.font = "11px Inter, sans-serif"; ctx.fillText("Issued", padL + 14, 7);
    ctx.fillStyle = "#16a34a"; ctx.fillRect(padL + 70, 0, 9, 9);
    ctx.fillStyle = "#334155"; ctx.fillText("Returned", padL + 84, 7);
  }

  function renderMostBorrowed(books, txns) {
    const counts = {};
    txns.forEach((t) => { counts[t.bookId] = (counts[t.bookId] || 0) + 1; });
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const el = $("#mostBorrowedList");
    if (!ranked.length) { el.innerHTML = '<div class="mini-item"><span class="mini-item-sub">No borrowing history yet</span></div>'; return; }
    el.innerHTML = ranked.map(([bookId, count]) => {
      const b = books.find((x) => x.id === bookId);
      if (!b) return "";
      return '<div class="mini-item"><div class="mini-item-main"><span class="mini-item-title">' + escapeHtml(b.title) +
        '</span><span class="mini-item-sub">' + escapeHtml(b.author) + '</span></div>' +
        '<span class="mini-item-count">' + count + ' issues</span></div>';
    }).join("");
  }

  function renderRecentActivity(books, members, txns) {
    const events = [];
    books.slice(0, 3).forEach((b) => events.push({ type: "Added", label: b.title, when: "Book" }));
    txns.slice(0, 6).forEach((t) => {
      const b = books.find((x) => x.id === t.bookId);
      const m = members.find((x) => x.id === t.memberId);
      if (!b || !m) return;
      if (t.returnDate) events.push({ type: "Returned", label: b.title + " — " + m.name, when: fmtDate(t.returnDate) });
      else events.push({ type: "Issued", label: b.title + " — " + m.name, when: fmtDate(t.issueDate) });
    });
    const el = $("#recentActivityList");
    el.innerHTML = events.slice(0, 8).map((e) =>
      '<div class="mini-item"><div class="mini-item-main"><span class="mini-item-title">' + escapeHtml(e.label) +
      '</span><span class="mini-item-sub">' + e.when + '</span></div>' +
      '<span class="badge badge-' + (e.type === "Returned" ? "green" : e.type === "Issued" ? "blue" : "ink") + '">' + e.type + '</span></div>'
    ).join("");
  }

  /* =========================================================
     9. BOOKS
     ========================================================= */
  function populateCategoryFilter() {
    const books = Store.getBooks();
    const cats = Array.from(new Set(books.map((b) => b.category))).sort();
    const sel = $("#bookCategoryFilter");
    const current = sel.value;
    sel.innerHTML = '<option value="">All categories</option>' + cats.map((c) => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join("");
    sel.value = current;
    $("#categoryList").innerHTML = cats.map((c) => '<option value="' + escapeHtml(c) + '">').join("");
  }

  function renderBooks() {
    populateCategoryFilter();
    const books = Store.getBooks();
    const q = $("#bookSearch").value.trim().toLowerCase();
    const cat = $("#bookCategoryFilter").value;
    const avail = $("#bookAvailFilter").value;
    const sort = $("#bookSort").value;

    let list = books.filter((b) => {
      const matchQ = !q || [b.title, b.author, b.isbn, b.id].some((v) => String(v).toLowerCase().includes(q));
      const matchCat = !cat || b.category === cat;
      const matchAvail = !avail || (avail === "available" ? b.availQty > 0 : b.availQty === 0);
      return matchQ && matchCat && matchAvail;
    });

    if (sort === "title") list = list.slice().sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "author") list = list.slice().sort((a, b) => a.author.localeCompare(b.author));
    else if (sort === "available") list = list.slice().sort((a, b) => b.availQty - a.availQty);

    $("#booksEmpty").classList.toggle("show", list.length === 0);
    $("#booksTableBody").innerHTML = list.map((b) => {
      const statusBadge = b.availQty > 0
        ? '<span class="badge badge-green"><span class="badge-dot"></span>Available</span>'
        : '<span class="badge badge-red"><span class="badge-dot"></span>Unavailable</span>';
      return '<tr>' +
        '<td class="cell-strong">' + escapeHtml(b.id) + '</td>' +
        '<td class="cell-strong">' + escapeHtml(b.title) + '</td>' +
        '<td>' + escapeHtml(b.author) + '</td>' +
        '<td class="cell-muted">' + escapeHtml(b.isbn) + '</td>' +
        '<td>' + escapeHtml(b.category) + '</td>' +
        '<td>' + escapeHtml(b.publisher) + '</td>' +
        '<td>' + b.year + '</td>' +
        '<td>' + b.totalQty + '</td>' +
        '<td>' + b.availQty + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td><div class="row-actions">' +
          '<button class="icon-action" data-view-book="' + b.id + '" title="View"><svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg></button>' +
          '<button class="icon-action" data-edit-book="' + b.id + '" title="Edit"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>' +
          '<button class="icon-action danger" data-delete-book="' + b.id + '" title="Delete"><svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>' +
        '</div></td></tr>';
    }).join("");
  }

  function fillBookForm(book) {
    $("#bookEditId").value = book ? book.id : "";
    $("#fBookId").value = book ? book.id : "";
    $("#fBookId").disabled = !!book;
    $("#fTitle").value = book ? book.title : "";
    $("#fAuthor").value = book ? book.author : "";
    $("#fIsbn").value = book ? book.isbn : "";
    $("#fCategory").value = book ? book.category : "";
    $("#fPublisher").value = book ? book.publisher : "";
    $("#fYear").value = book ? book.year : "";
    $("#fTotalQty").value = book ? book.totalQty : "";
    $("#fAvailQty").value = book ? book.availQty : "";
    clearErrors(["fBookId", "fTitle", "fAuthor", "fIsbn", "fCategory", "fPublisher", "fYear", "fTotalQty", "fAvailQty"]);
  }

  $("#btnAddBook").addEventListener("click", () => {
    $("#bookModalTitle").textContent = "Add Book";
    fillBookForm(null);
    openModal("bookModal");
  });

  const BOOK_FIELD_MAP = { id: "fBookId", title: "fTitle", author: "fAuthor", isbn: "fIsbn", category: "fCategory", publisher: "fPublisher", year: "fYear", totalQty: "fTotalQty", availQty: "fAvailQty" };

  $("#bookForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = $("#bookEditId").value;
    const id = $("#fBookId").value.trim();
    const title = $("#fTitle").value.trim();
    const author = $("#fAuthor").value.trim();
    const isbn = $("#fIsbn").value.trim();
    const category = $("#fCategory").value.trim();
    const publisher = $("#fPublisher").value.trim();
    const year = parseInt($("#fYear").value, 10);
    const totalQty = parseInt($("#fTotalQty").value, 10);
    const availQty = parseInt($("#fAvailQty").value, 10);

    const fields = ["fBookId", "fTitle", "fAuthor", "fIsbn", "fCategory", "fPublisher", "fYear", "fTotalQty", "fAvailQty"];
    clearErrors(fields);
    let ok = true;
    const books = Store.getBooks();

    if (!id) { setFieldError("fBookId", "Book ID is required."); ok = false; }
    else if (!editId && books.some((b) => b.id.toLowerCase() === id.toLowerCase())) { setFieldError("fBookId", "This Book ID already exists."); ok = false; }

    if (!title) { setFieldError("fTitle", "Title is required."); ok = false; }
    if (!author) { setFieldError("fAuthor", "Author is required."); ok = false; }

    if (!isbn) { setFieldError("fIsbn", "ISBN is required."); ok = false; }
    else if (!isValidISBN(isbn)) { setFieldError("fIsbn", "Enter a valid 10 or 13 digit ISBN."); ok = false; }
    else if (books.some((b) => b.isbn.replace(/[-\s]/g, "") === isbn.replace(/[-\s]/g, "") && b.id !== editId)) { setFieldError("fIsbn", "This ISBN already exists."); ok = false; }

    if (!category) { setFieldError("fCategory", "Category is required."); ok = false; }
    if (!publisher) { setFieldError("fPublisher", "Publisher is required."); ok = false; }
    if (!year || year < 1900 || year > 2026) { setFieldError("fYear", "Enter a valid publication year."); ok = false; }
    if (!totalQty || totalQty <= 0) { setFieldError("fTotalQty", "Quantity must be greater than 0."); ok = false; }
    if (availQty === "" || isNaN(availQty) || availQty < 0) { setFieldError("fAvailQty", "Available copies cannot be negative."); ok = false; }
    else if (totalQty && availQty > totalQty) { setFieldError("fAvailQty", "Available copies cannot exceed total quantity."); ok = false; }

    if (!ok) return;

    const submitBtn = $("#bookForm button[type=submit]");
    submitBtn.disabled = true;
    try {
      if (editId) {
        await Api.updateBook(editId, { title, author, isbn, category, publisher, year, totalQty, availQty });
        toast("Book updated successfully.", "success");
      } else {
        await Api.addBook({ id, title, author, isbn, category, publisher, year, totalQty, availQty });
        toast("Book added successfully.", "success");
      }
      closeModal();
      await refreshCache();
      renderAll();
    } catch (err) {
      applyServerErrors(err.errors, BOOK_FIELD_MAP);
      toast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  $("#booksTableBody").addEventListener("click", (e) => {
    const viewId = e.target.closest("[data-view-book]");
    const editId = e.target.closest("[data-edit-book]");
    const delId = e.target.closest("[data-delete-book]");
    if (viewId) {
      const b = Store.getBooks().find((x) => x.id === viewId.dataset.viewBook);
      if (!b) return;
      showDetails(b.title, [
        ["Book ID", b.id], ["Author", b.author], ["ISBN", b.isbn], ["Category", b.category],
        ["Publisher", b.publisher], ["Year", String(b.year)], ["Total copies", String(b.totalQty)],
        ["Available copies", String(b.availQty)],
      ]);
    } else if (editId) {
      const b = Store.getBooks().find((x) => x.id === editId.dataset.editBook);
      if (!b) return;
      $("#bookModalTitle").textContent = "Edit Book";
      fillBookForm(b);
      openModal("bookModal");
    } else if (delId) {
      const id = delId.dataset.deleteBook;
      const b = Store.getBooks().find((x) => x.id === id);
      confirmAction('Delete "' + (b ? b.title : id) + '"? This cannot be undone.', async () => {
        try {
          await Api.deleteBook(id);
          toast("Book deleted.", "success");
          await refreshCache();
          renderAll();
        } catch (err) {
          toast(err.message, "error");
        }
      }, "Delete book");
    }
  });

  ["bookSearch", "bookCategoryFilter", "bookAvailFilter", "bookSort"].forEach((id) =>
    $("#" + id).addEventListener("input", renderBooks)
  );

  /* =========================================================
     10. MEMBERS
     ========================================================= */
  function renderMembers() {
    const members = Store.getMembers();
    const txns = Store.getTxns();
    const q = $("#memberSearch").value.trim().toLowerCase();
    const list = members.filter((m) => !q || [m.name, m.id, m.email].some((v) => v.toLowerCase().includes(q)));

    $("#membersEmpty").classList.toggle("show", list.length === 0);
    $("#membersTableBody").innerHTML = list.map((m) => {
      const active = txns.filter((t) => t.memberId === m.id && effectiveStatus(t) !== "Returned").length;
      return '<tr>' +
        '<td class="cell-strong">' + escapeHtml(m.id) + '</td>' +
        '<td class="cell-strong">' + escapeHtml(m.name) + '</td>' +
        '<td class="cell-muted">' + escapeHtml(m.email) + '</td>' +
        '<td>' + escapeHtml(m.phone) + '</td>' +
        '<td>' + escapeHtml(m.course) + '</td>' +
        '<td>' + m.semester + '</td>' +
        '<td><span class="badge ' + (active > 0 ? "badge-blue" : "badge-ink") + '">' + active + '</span></td>' +
        '<td><div class="row-actions">' +
          '<button class="icon-action" data-view-member="' + m.id + '" title="View"><svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg></button>' +
          '<button class="icon-action" data-edit-member="' + m.id + '" title="Edit"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg></button>' +
          '<button class="icon-action danger" data-delete-member="' + m.id + '" title="Delete"><svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>' +
        '</div></td></tr>';
    }).join("");
  }

  function fillMemberForm(m) {
    $("#memberEditId").value = m ? m.id : "";
    $("#fMemberId").value = m ? m.id : "";
    $("#fMemberId").disabled = !!m;
    $("#fMemberName").value = m ? m.name : "";
    $("#fMemberEmail").value = m ? m.email : "";
    $("#fMemberPhone").value = m ? m.phone : "";
    $("#fMemberCourse").value = m ? m.course : "";
    $("#fMemberSemester").value = m ? m.semester : "";
    clearErrors(["fMemberId", "fMemberName", "fMemberEmail", "fMemberPhone", "fMemberCourse", "fMemberSemester"]);
  }

  $("#btnAddMember").addEventListener("click", () => {
    $("#memberModalTitle").textContent = "Add Member";
    fillMemberForm(null);
    openModal("memberModal");
  });

  const MEMBER_FIELD_MAP = { id: "fMemberId", name: "fMemberName", email: "fMemberEmail", phone: "fMemberPhone", course: "fMemberCourse", semester: "fMemberSemester" };

  $("#memberForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = $("#memberEditId").value;
    const id = $("#fMemberId").value.trim();
    const name = $("#fMemberName").value.trim();
    const email = $("#fMemberEmail").value.trim();
    const phone = $("#fMemberPhone").value.trim();
    const course = $("#fMemberCourse").value.trim();
    const semester = parseInt($("#fMemberSemester").value, 10);

    const fields = ["fMemberId", "fMemberName", "fMemberEmail", "fMemberPhone", "fMemberCourse", "fMemberSemester"];
    clearErrors(fields);
    let ok = true;
    const members = Store.getMembers();

    if (!id) { setFieldError("fMemberId", "Member ID is required."); ok = false; }
    else if (!editId && members.some((m) => m.id.toLowerCase() === id.toLowerCase())) { setFieldError("fMemberId", "This Member ID already exists."); ok = false; }
    if (!name) { setFieldError("fMemberName", "Name is required."); ok = false; }
    if (!email) { setFieldError("fMemberEmail", "Email is required."); ok = false; }
    else if (!isValidEmail(email)) { setFieldError("fMemberEmail", "Enter a valid email address."); ok = false; }
    if (!phone) { setFieldError("fMemberPhone", "Phone is required."); ok = false; }
    else if (!isValidPhone(phone)) { setFieldError("fMemberPhone", "Enter a valid 10-digit phone number."); ok = false; }
    if (!course) { setFieldError("fMemberCourse", "Course/Department is required."); ok = false; }
    if (!semester || semester < 1 || semester > 8) { setFieldError("fMemberSemester", "Semester must be between 1 and 8."); ok = false; }

    if (!ok) return;

    const submitBtn = $("#memberForm button[type=submit]");
    submitBtn.disabled = true;
    try {
      if (editId) {
        await Api.updateMember(editId, { name, email, phone, course, semester });
        toast("Member updated successfully.", "success");
      } else {
        await Api.addMember({ id, name, email, phone, course, semester });
        toast("Member added successfully.", "success");
      }
      closeModal();
      await refreshCache();
      renderAll();
    } catch (err) {
      applyServerErrors(err.errors, MEMBER_FIELD_MAP);
      toast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  $("#membersTableBody").addEventListener("click", (e) => {
    const viewId = e.target.closest("[data-view-member]");
    const editId = e.target.closest("[data-edit-member]");
    const delId = e.target.closest("[data-delete-member]");
    if (viewId) {
      const m = Store.getMembers().find((x) => x.id === viewId.dataset.viewMember);
      if (!m) return;
      const active = Store.getTxns().filter((t) => t.memberId === m.id && effectiveStatus(t) !== "Returned").length;
      showDetails(m.name, [
        ["Member ID", m.id], ["Email", m.email], ["Phone", m.phone],
        ["Course", m.course], ["Semester", String(m.semester)], ["Books currently issued", String(active)],
      ]);
    } else if (editId) {
      const m = Store.getMembers().find((x) => x.id === editId.dataset.editMember);
      if (!m) return;
      $("#memberModalTitle").textContent = "Edit Member";
      fillMemberForm(m);
      openModal("memberModal");
    } else if (delId) {
      const id = delId.dataset.deleteMember;
      const m = Store.getMembers().find((x) => x.id === id);
      const active = Store.getTxns().filter((t) => t.memberId === id && effectiveStatus(t) !== "Returned").length;
      if (active > 0) { toast("Cannot delete a member with " + active + " active issued book(s).", "error"); return; }
      confirmAction('Delete member "' + (m ? m.name : id) + '"? This cannot be undone.', async () => {
        try {
          await Api.deleteMember(id);
          toast("Member deleted.", "success");
          await refreshCache();
          renderAll();
        } catch (err) {
          toast(err.message, "error");
        }
      }, "Delete member");
    }
  });

  $("#memberSearch").addEventListener("input", renderMembers);

  /* =========================================================
     11. ISSUE BOOK
     ========================================================= */
  function populateIssueSelectors() {
    const members = Store.getMembers();
    const books = Store.getBooks();
    $("#issueMember").innerHTML = '<option value="">Select a member</option>' +
      members.map((m) => '<option value="' + m.id + '">' + escapeHtml(m.name) + ' (' + m.id + ')</option>').join("");
    $("#issueBook").innerHTML = '<option value="">Select a book</option>' +
      books.map((b) => '<option value="' + b.id + '">' + escapeHtml(b.title) + ' — ' + b.availQty + ' available</option>').join("");
  }

  function updateIssueAvailability() {
    const bookId = $("#issueBook").value;
    const box = $("#issueAvailability");
    if (!bookId) { box.hidden = true; return; }
    const book = Store.getBooks().find((b) => b.id === bookId);
    box.hidden = false;
    if (book.availQty > 0) {
      box.className = "availability-box ok";
      box.textContent = book.availQty + " of " + book.totalQty + " copies available — ready to issue.";
    } else {
      box.className = "availability-box bad";
      box.textContent = "No copies of \u201c" + book.title + "\u201d are currently available.";
    }
  }
  $("#issueBook").addEventListener("change", updateIssueAvailability);
  $("#issueDate").addEventListener("change", () => {
    if (!$("#dueDate").value) {
      const dt = new Date($("#issueDate").value || todayStr());
      dt.setDate(dt.getDate() + 14);
      $("#dueDate").value = dt.toISOString().slice(0, 10);
    }
  });

  const ISSUE_FIELD_MAP = { memberId: "issueMember", bookId: "issueBook", issueDate: "issueDate", dueDate: "dueDate" };

  $("#issueForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fields = ["issueMember", "issueBook", "issueDate", "dueDate"];
    clearErrors(fields);
    let ok = true;

    const memberId = $("#issueMember").value;
    const bookId = $("#issueBook").value;
    const issueDate = $("#issueDate").value;
    const dueDate = $("#dueDate").value;

    if (!memberId) { setFieldError("issueMember", "Select a valid member."); ok = false; }
    else if (!Store.getMembers().some((m) => m.id === memberId)) { setFieldError("issueMember", "This member does not exist."); ok = false; }

    const book = Store.getBooks().find((b) => b.id === bookId);
    if (!bookId) { setFieldError("issueBook", "Select a book to issue."); ok = false; }
    else if (!book) { setFieldError("issueBook", "This book does not exist."); ok = false; }
    else if (book.availQty <= 0) { setFieldError("issueBook", "No copies available for this book."); ok = false; }

    if (!issueDate) { setFieldError("issueDate", "Issue date is required."); ok = false; }
    if (!dueDate) { setFieldError("dueDate", "Due date is required."); ok = false; }
    else if (issueDate && dueDate < issueDate) { setFieldError("dueDate", "Due date cannot be before the issue date."); ok = false; }

    if (!ok) {
      toast("Please fix the highlighted fields.", "error");
      return;
    }

    const submitBtn = $("#issueForm button[type=submit]");
    submitBtn.disabled = true;
    try {
      await Api.issueBook({ bookId, memberId, issueDate, dueDate });
      toast("Book issued successfully.", "success");
      $("#issueForm").reset();
      $("#issueAvailability").hidden = true;
      $("#issueDate").value = todayStr();
      const due = new Date(); due.setDate(due.getDate() + 14);
      $("#dueDate").value = due.toISOString().slice(0, 10);
      await refreshCache();
      renderAll();
    } catch (err) {
      applyServerErrors(err.errors, ISSUE_FIELD_MAP);
      toast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  function renderIssuedPreview() {
    const books = Store.getBooks();
    const members = Store.getMembers();
    const txns = Store.getTxns().filter((t) => effectiveStatus(t) !== "Returned").slice(0, 8);
    $("#issuedPreviewBody").innerHTML = txns.map((t) => {
      const b = books.find((x) => x.id === t.bookId);
      const m = members.find((x) => x.id === t.memberId);
      const status = effectiveStatus(t);
      return '<tr><td class="cell-strong">' + t.id + '</td><td>' + escapeHtml(b ? b.title : "—") + '</td>' +
        '<td>' + escapeHtml(m ? m.name : "—") + '</td><td>' + fmtDate(t.issueDate) + '</td><td>' + fmtDate(t.dueDate) + '</td>' +
        '<td><span class="badge ' + (status === "Overdue" ? "badge-red" : "badge-blue") + '">' + status + '</span></td></tr>';
    }).join("") || '<tr><td colspan="6" class="cell-muted">No books currently issued.</td></tr>';
  }

  /* =========================================================
     12. RETURN BOOK
     ========================================================= */
  function renderReturn() {
    const books = Store.getBooks();
    const members = Store.getMembers();
    const q = $("#returnSearch").value.trim().toLowerCase();
    let txns = Store.getTxns().filter((t) => t.status === "Issued");

    if (q) {
      txns = txns.filter((t) => {
        const b = books.find((x) => x.id === t.bookId);
        const m = members.find((x) => x.id === t.memberId);
        return [t.id, b && b.title, m && m.name].some((v) => v && v.toLowerCase().includes(q));
      });
    }

    $("#returnEmpty").classList.toggle("show", txns.length === 0);
    $("#returnTableBody").innerHTML = txns.map((t) => {
      const b = books.find((x) => x.id === t.bookId);
      const m = members.find((x) => x.id === t.memberId);
      const status = effectiveStatus(t);
      const fine = computeFine(t.dueDate, todayStr());
      return '<tr><td class="cell-strong">' + t.id + '</td><td>' + escapeHtml(m ? m.name : "—") + '</td>' +
        '<td>' + escapeHtml(b ? b.title : "—") + '</td><td>' + fmtDate(t.issueDate) + '</td><td>' + fmtDate(t.dueDate) + '</td>' +
        '<td><span class="badge ' + (status === "Overdue" ? "badge-red" : "badge-blue") + '">' + status + '</span></td>' +
        '<td>' + (fine > 0 ? '<span class="badge badge-orange">₹' + fine + '</span>' : '—') + '</td>' +
        '<td><button class="btn btn-primary btn-sm" data-return-txn="' + t.id + '">Return</button></td></tr>';
    }).join("");
  }

  $("#returnTableBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-return-txn]");
    if (!btn) return;
    const txnId = btn.dataset.returnTxn;
    const t = Store.getTxns().find((x) => x.id === txnId);
    if (!t) return;
    const book = Store.getBooks().find((b) => b.id === t.bookId);
    const member = Store.getMembers().find((m) => m.id === t.memberId);
    if (t.status === "Returned") { toast("This book has already been returned.", "warning"); return; }

    const fine = computeFine(t.dueDate, todayStr());
    confirmAction(
      (book ? book.title : "This book") + " returned by " + (member ? member.name : "member") +
      (fine > 0 ? ". Overdue fine of ₹" + fine + " will be recorded." : "."),
      async () => {
        try {
          const result = await Api.returnTxn(t.id);
          if (result.fine > 0) toast("Book returned. Overdue fine: ₹" + result.fine + ".", "warning");
          else toast("Book returned successfully.", "success");
          await refreshCache();
          renderAll();
        } catch (err) {
          toast(err.message, "error");
        }
      },
      "Confirm return"
    );
  });

  $("#returnSearch").addEventListener("input", renderReturn);

  /* =========================================================
     13. TRANSACTIONS
     ========================================================= */
  function inDateRange(iso, range) {
    if (!range) return true;
    const d = new Date(iso + "T00:00:00");
    const now = new Date();
    if (range === "today") return iso === todayStr();
    if (range === "week") { const diff = (now - d) / 86400000; return diff >= 0 && diff <= 7; }
    if (range === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return true;
  }

  function renderTransactions() {
    const books = Store.getBooks();
    const members = Store.getMembers();
    const q = $("#txnSearch").value.trim().toLowerCase();
    const statusFilter = $("#txnStatusFilter").value;
    const dateFilter = $("#txnDateFilter").value;
    const sort = $("#txnSort").value;

    let txns = Store.getTxns().map((t) => Object.assign({}, t, { _status: effectiveStatus(t) }));

    if (q) {
      txns = txns.filter((t) => {
        const b = books.find((x) => x.id === t.bookId);
        const m = members.find((x) => x.id === t.memberId);
        return [t.id, b && b.title, m && m.name].some((v) => v && v.toLowerCase().includes(q));
      });
    }
    if (statusFilter) txns = txns.filter((t) => t._status === statusFilter);
    if (dateFilter) txns = txns.filter((t) => inDateRange(t.issueDate, dateFilter));

    txns.sort((a, b) => sort === "oldest" ? a.issueDate.localeCompare(b.issueDate) : b.issueDate.localeCompare(a.issueDate));

    $("#txnEmpty").classList.toggle("show", txns.length === 0);
    $("#txnTableBody").innerHTML = txns.map((t) => {
      const b = books.find((x) => x.id === t.bookId);
      const m = members.find((x) => x.id === t.memberId);
      const fine = t.status === "Returned" ? t.fine : computeFine(t.dueDate, todayStr());
      const badgeClass = t._status === "Overdue" ? "badge-red" : t._status === "Returned" ? "badge-green" : "badge-blue";
      return '<tr><td class="cell-strong">' + t.id + '</td><td>' + escapeHtml(b ? b.title : "—") + '</td>' +
        '<td>' + escapeHtml(m ? m.name : "—") + '</td><td>' + fmtDate(t.issueDate) + '</td><td>' + fmtDate(t.dueDate) + '</td>' +
        '<td>' + fmtDate(t.returnDate) + '</td><td><span class="badge ' + badgeClass + '">' + t._status + '</span></td>' +
        '<td>' + (fine > 0 ? "₹" + fine : "—") + '</td></tr>';
    }).join("");
  }

  ["txnSearch", "txnStatusFilter", "txnDateFilter", "txnSort"].forEach((id) => $("#" + id).addEventListener("input", renderTransactions));

  /* =========================================================
     14. REPORTS
     ========================================================= */
  $("#reportDateFilter").addEventListener("change", () => {
    const custom = $("#reportDateFilter").value === "custom";
    $("#reportFrom").hidden = !custom;
    $("#reportTo").hidden = !custom;
  });

  function reportRangeFilter(iso) {
    const mode = $("#reportDateFilter").value;
    if (mode === "all" || !iso) return true;
    if (mode === "custom") {
      const from = $("#reportFrom").value, to = $("#reportTo").value;
      if (from && iso < from) return false;
      if (to && iso > to) return false;
      return true;
    }
    return inDateRange(iso, mode);
  }

  let lastReport = { head: [], rows: [], title: "" };

  function generateReport() {
    const type = $("#reportType").value;
    const books = Store.getBooks();
    const members = Store.getMembers();
    const txns = Store.getTxns().map((t) => Object.assign({}, t, { _status: effectiveStatus(t) }));

    let head = [], rows = [], title = "", summary = [];

    if (type === "total" || type === "available") {
      head = ["Book ID", "Title", "Author", "Category", "Total", "Available"];
      rows = books.map((b) => [b.id, b.title, b.author, b.category, b.totalQty, b.availQty]);
      title = type === "total" ? "Total books report" : "Available books report";
      if (type === "available") rows = rows.filter((r) => r[5] > 0);
      summary = [
        ["Total titles", books.length],
        ["Total copies", books.reduce((s, b) => s + b.totalQty, 0)],
        ["Available copies", books.reduce((s, b) => s + b.availQty, 0)],
      ];
    } else if (type === "issued" || type === "overdue" || type === "returned") {
      const statusMap = { issued: "Issued", overdue: "Overdue", returned: "Returned" };
      head = ["Txn ID", "Book", "Member", "Issue date", "Due date", "Return date", "Status", "Fine"];
      rows = txns.filter((t) => t._status === statusMap[type] && reportRangeFilter(t.issueDate)).map((t) => {
        const b = books.find((x) => x.id === t.bookId), m = members.find((x) => x.id === t.memberId);
        const fine = t.status === "Returned" ? t.fine : computeFine(t.dueDate, todayStr());
        return [t.id, b ? b.title : "—", m ? m.name : "—", fmtDate(t.issueDate), fmtDate(t.dueDate), fmtDate(t.returnDate), t._status, fine ? "₹" + fine : "—"];
      });
      title = statusMap[type] + " books report";
      summary = [["Records", rows.length]];
    } else if (type === "member") {
      head = ["Member ID", "Name", "Course", "Currently issued", "Total ever issued", "Total fines paid"];
      rows = members.map((m) => {
        const mTxns = txns.filter((t) => t.memberId === m.id);
        const active = mTxns.filter((t) => t._status !== "Returned").length;
        const finesPaid = mTxns.filter((t) => t.status === "Returned").reduce((s, t) => s + (t.fine || 0), 0);
        return [m.id, m.name, m.course, active, mTxns.length, finesPaid ? "₹" + finesPaid : "—"];
      });
      title = "Member activity report";
      summary = [["Total members", members.length]];
    } else if (type === "most-borrowed") {
      const counts = {};
      txns.forEach((t) => { counts[t.bookId] = (counts[t.bookId] || 0) + 1; });
      head = ["Book ID", "Title", "Author", "Times borrowed"];
      rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([bookId, count]) => {
        const b = books.find((x) => x.id === bookId);
        return [bookId, b ? b.title : "—", b ? b.author : "—", count];
      });
      title = "Most borrowed books";
      summary = [["Distinct titles borrowed", rows.length]];
    } else if (type === "category") {
      const byCat = {};
      books.forEach((b) => {
        byCat[b.category] = byCat[b.category] || { titles: 0, total: 0, available: 0 };
        byCat[b.category].titles += 1;
        byCat[b.category].total += b.totalQty;
        byCat[b.category].available += b.availQty;
      });
      head = ["Category", "Titles", "Total copies", "Available copies"];
      rows = Object.entries(byCat).map(([cat, v]) => [cat, v.titles, v.total, v.available]);
      title = "Books by category";
      summary = [["Categories", rows.length]];
    } else if (type === "history") {
      head = ["Txn ID", "Book", "Member", "Issue date", "Due date", "Return date", "Status", "Fine"];
      rows = txns.filter((t) => reportRangeFilter(t.issueDate)).map((t) => {
        const b = books.find((x) => x.id === t.bookId), m = members.find((x) => x.id === t.memberId);
        const fine = t.status === "Returned" ? t.fine : computeFine(t.dueDate, todayStr());
        return [t.id, b ? b.title : "—", m ? m.name : "—", fmtDate(t.issueDate), fmtDate(t.dueDate), fmtDate(t.returnDate), t._status, fine ? "₹" + fine : "—"];
      });
      title = "Issue / return history";
      summary = [["Total transactions", rows.length]];
    }

    lastReport = { head, rows, title };

    $("#reportSummary").innerHTML = summary.map((s) =>
      '<div class="stat-card"><div class="stat-value">' + s[1] + '</div><div class="stat-label">' + s[0] + '</div></div>'
    ).join("");

    $("#reportTableHead").innerHTML = "<tr>" + head.map((h) => "<th>" + escapeHtml(h) + "</th>").join("") + "</tr>";
    $("#reportEmpty").classList.toggle("show", rows.length === 0);
    $("#reportTableBody").innerHTML = rows.map((r) => "<tr>" + r.map((c) => "<td>" + escapeHtml(c) + "</td>").join("") + "</tr>").join("");
  }

  $("#btnGenerateReport").addEventListener("click", generateReport);
  $("#reportType").addEventListener("change", generateReport);

  $("#btnPrintReport").addEventListener("click", () => {
    if (!lastReport.rows.length) { toast("Generate a report before printing.", "warning"); return; }
    const w = window.open("", "_blank");
    const html = "<html><head><title>" + escapeHtml(lastReport.title) + "</title>" +
      "<style>body{font-family:Arial,sans-serif;padding:24px;}h1{font-size:18px;}table{width:100%;border-collapse:collapse;margin-top:16px;}" +
      "th,td{border:1px solid #ddd;padding:8px;font-size:12px;text-align:left;}th{background:#f5f5f5;}</style></head><body>" +
      "<h1>" + escapeHtml(lastReport.title) + "</h1><p>Generated on " + fmtDate(todayStr()) + "</p>" +
      "<table><thead><tr>" + lastReport.head.map((h) => "<th>" + escapeHtml(h) + "</th>").join("") + "</tr></thead><tbody>" +
      lastReport.rows.map((r) => "<tr>" + r.map((c) => "<td>" + escapeHtml(c) + "</td>").join("") + "</tr>").join("") +
      "</tbody></table></body></html>";
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  });

  $("#btnExportReport").addEventListener("click", () => {
    if (!lastReport.rows.length) { toast("Generate a report before exporting.", "warning"); return; }
    const csvRows = [lastReport.head.join(",")].concat(
      lastReport.rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(","))
    );
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = lastReport.title.replace(/\s+/g, "_").toLowerCase() + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Report exported as CSV.", "success");
  });

  /* =========================================================
     15. GLOBAL SEARCH  (routes to the relevant module)
     ========================================================= */
  $("#globalSearch").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = e.target.value.trim();
    if (!q) return;
    const books = Store.getBooks(), members = Store.getMembers();
    const bookHit = books.some((b) => [b.title, b.author, b.isbn, b.id].some((v) => String(v).toLowerCase().includes(q.toLowerCase())));
    const memberHit = members.some((m) => [m.name, m.id, m.email].some((v) => v.toLowerCase().includes(q.toLowerCase())));
    if (bookHit) { switchView("books"); $("#bookSearch").value = q; renderBooks(); }
    else if (memberHit) { switchView("members"); $("#memberSearch").value = q; renderMembers(); }
    else { switchView("transactions"); $("#txnSearch").value = q; renderTransactions(); }
  });

  /* =========================================================
     16. MASTER RENDER
     ========================================================= */
  function renderAll() {
    renderDashboard();
    renderBooks();
    renderMembers();
    populateIssueSelectors();
    renderIssuedPreview();
    renderReturn();
    renderTransactions();
  }

  window.addEventListener("resize", () => {
    if ($("#view-dashboard").classList.contains("active")) renderDashboard();
  });

  /* =========================================================
     17. INIT
     ========================================================= */
  async function init() {
    $("#issueDate").value = todayStr();
    const due = new Date(); due.setDate(due.getDate() + 14);
    $("#dueDate").value = due.toISOString().slice(0, 10);

    try {
      await refreshCache();
      populateIssueSelectors();
      renderAll();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();