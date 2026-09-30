-- =========================================================
-- LibraTrack — demo data (same dataset as the frontend prototype)
-- Run after schema.sql:
--   mysql -u root -p library_db < seed.sql
-- =========================================================

USE library_db;

INSERT INTO books (id, title, author, isbn, category, publisher, year, total_qty, avail_qty) VALUES
('BK001', 'Clean Code', 'Robert C. Martin', '9780132350884', 'Software Engineering', 'Prentice Hall', 2008, 5, 5),
('BK002', 'The Pragmatic Programmer', 'Andrew Hunt', '9780135957059', 'Software Engineering', 'Addison-Wesley', 2019, 4, 4),
('BK003', 'Introduction to Algorithms', 'Thomas H. Cormen', '9780262046305', 'Computer Science', 'MIT Press', 2022, 6, 6),
('BK004', 'Database System Concepts', 'Abraham Silberschatz', '9780078022159', 'Database', 'McGraw-Hill', 2019, 5, 5),
('BK005', 'Computer Networks', 'Andrew S. Tanenbaum', '9780132126953', 'Networking', 'Pearson', 2010, 4, 4),
('BK006', 'Operating System Concepts', 'Abraham Silberschatz', '9781119800361', 'Operating Systems', 'Wiley', 2021, 5, 5),
('BK007', 'Artificial Intelligence: A Modern Approach', 'Stuart Russell', '9780134610993', 'Artificial Intelligence', 'Pearson', 2020, 3, 3),
('BK008', 'Cloud Computing: Concepts, Technology & Architecture', 'Thomas Erl', '9780133387520', 'Cloud Computing', 'Prentice Hall', 2013, 4, 4),
('BK009', 'Software Engineering', 'Ian Sommerville', '9780133943030', 'Software Engineering', 'Pearson', 2015, 5, 5),
('BK010', 'Data Structures and Algorithms in Java', 'Robert Lafore', '9780672324536', 'Computer Science', 'Sams', 2002, 6, 6);

INSERT INTO members (id, name, email, phone, course, semester) VALUES
('MEM001', 'Aarav Sharma', 'aarav.sharma@lpu.in', '9876500001', 'B.Tech CSE', 5),
('MEM002', 'Priya Verma', 'priya.verma@lpu.in', '9876500002', 'B.Tech IT', 3),
('MEM003', 'Rohan Mehta', 'rohan.mehta@lpu.in', '9876500003', 'B.Tech CSE', 7),
('MEM004', 'Sneha Kapoor', 'sneha.kapoor@lpu.in', '9876500004', 'B.Sc CS', 4),
('MEM005', 'Karan Malhotra', 'karan.malhotra@lpu.in', '9876500005', 'B.Tech ECE', 5),
('MEM006', 'Ishita Singh', 'ishita.singh@lpu.in', '9876500006', 'MCA', 2),
('MEM007', 'Aditya Rana', 'aditya.rana@lpu.in', '9876500007', 'B.Tech CSE', 1),
('MEM008', 'Neha Thakur', 'neha.thakur@lpu.in', '9876500008', 'B.Tech IT', 6);

-- A handful of sample transactions (some returned with fines, some still issued)
INSERT INTO transactions (id, book_id, member_id, issue_date, due_date, return_date, status, fine) VALUES
('TXN001', 'BK001', 'MEM001', DATE_SUB(CURDATE(), INTERVAL 20 DAY), DATE_SUB(CURDATE(), INTERVAL 6 DAY), DATE_SUB(CURDATE(), INTERVAL 7 DAY), 'Returned', 0),
('TXN002', 'BK003', 'MEM002', DATE_SUB(CURDATE(), INTERVAL 18 DAY), DATE_SUB(CURDATE(), INTERVAL 4 DAY), NULL, 'Issued', 0),
('TXN003', 'BK005', 'MEM003', DATE_SUB(CURDATE(), INTERVAL 15 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), NULL, 'Issued', 0),
('TXN004', 'BK007', 'MEM004', DATE_SUB(CURDATE(), INTERVAL 30 DAY), DATE_SUB(CURDATE(), INTERVAL 16 DAY), DATE_SUB(CURDATE(), INTERVAL 14 DAY), 'Returned', 10),
('TXN005', 'BK002', 'MEM005', DATE_SUB(CURDATE(), INTERVAL 10 DAY), DATE_ADD(CURDATE(), INTERVAL 4 DAY), NULL, 'Issued', 0);

-- Reduce available copies for books currently on issue
UPDATE books SET avail_qty = avail_qty - 1 WHERE id IN ('BK003', 'BK005', 'BK002');
