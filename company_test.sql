-- ── Create Tables ──

DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS projects CASCADE;

CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    budget NUMERIC(15, 2) NOT NULL,
    location VARCHAR(100) NOT NULL
);

CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    joining_date DATE NOT NULL,
    salary NUMERIC(15, 2) NOT NULL,
    bonus NUMERIC(15, 2) NOT NULL,
    bank_account VARCHAR(50) NOT NULL,
    location VARCHAR(100) NOT NULL
);

CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    budget NUMERIC(15, 2) NOT NULL,
    department VARCHAR(100) NOT NULL
);

-- ── Populate Departments ──

INSERT INTO departments (name, budget, location) VALUES
('Finance', 5000000.00, 'Mumbai'),
('Marketing', 3000000.00, 'Delhi'),
('Engineering', 10000000.00, 'Bengaluru');

-- ── Populate Employees ──

INSERT INTO employees (name, department, joining_date, salary, bonus, bank_account, location) VALUES
('Aarav Mehta', 'Finance', '2020-01-15', 120000.00, 15000.00, 'IN-1234567890', 'Mumbai'),
('Ananya Sharma', 'Finance', '2021-06-20', 95000.00, 10000.00, 'IN-0987654321', 'Mumbai'),
('Rohan Das', 'Marketing', '2022-03-10', 75000.00, 8000.00, 'IN-5566778899', 'Delhi'),
('Siddharth Sen', 'Engineering', '2019-11-01', 180000.00, 25000.00, 'IN-3344556677', 'Bengaluru'),
('Priya Patel', 'Marketing', '2023-05-18', 68000.00, 5000.00, 'IN-4455667788', 'Mumbai');

-- ── Populate Projects ──

INSERT INTO projects (name, budget, department) VALUES
('Q3 Financial Audit', 150000.00, 'Finance'),
('Brand Relaunch 2026', 450000.00, 'Marketing'),
('NextGen Core Engine', 2500000.00, 'Engineering');

-- ── Create Financial Records and Transactions Tables ──

DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS financial_records CASCADE;

CREATE TABLE financial_records (
    id SERIAL PRIMARY KEY,
    fiscal_year INT NOT NULL,
    quarter VARCHAR(10) NOT NULL,
    revenue NUMERIC(15, 2) NOT NULL,
    expenses NUMERIC(15, 2) NOT NULL,
    net_income NUMERIC(15, 2) NOT NULL,
    department VARCHAR(100) NOT NULL
);

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    transaction_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL
);

-- ── Populate Financial Records ──

INSERT INTO financial_records (fiscal_year, quarter, revenue, expenses, net_income, department) VALUES
(2025, 'Q1', 1200000.00, 950000.00, 250000.00, 'Finance'),
(2025, 'Q2', 1500000.00, 1050000.00, 450000.00, 'Finance'),
(2025, 'Q3', 1800000.00, 1100000.00, 700000.00, 'Finance'),
(2025, 'Q4', 2100000.00, 1250000.00, 850000.00, 'Finance');

-- ── Populate Transactions ──

INSERT INTO transactions (employee_id, amount, transaction_type, transaction_date, status) VALUES
(1, 120000.00, 'salary', '2026-01-31', 'completed'),
(1, 15000.00, 'bonus', '2026-01-31', 'completed'),
(2, 95000.00, 'salary', '2026-01-31', 'completed'),
(3, 75000.00, 'salary', '2026-01-31', 'completed'),
(4, 180000.00, 'salary', '2026-01-31', 'completed'),
(5, 68000.00, 'salary', '2026-01-31', 'completed');

-- ── Create RM, Clients, and Incentives Tables ──

DROP TABLE IF EXISTS incentives CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS relationship_managers CASCADE;

CREATE TABLE relationship_managers (
    id SERIAL PRIMARY KEY,
    employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
    region VARCHAR(50) NOT NULL,
    target_aum NUMERIC(15, 2) NOT NULL
);

CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    aum NUMERIC(15, 2) NOT NULL,
    rm_id INT REFERENCES relationship_managers(id) ON DELETE SET NULL
);

CREATE TABLE incentives (
    id SERIAL PRIMARY KEY,
    rm_id INT REFERENCES relationship_managers(id) ON DELETE CASCADE,
    quarter VARCHAR(10) NOT NULL,
    revenue_generated NUMERIC(15, 2) NOT NULL,
    incentive_earned NUMERIC(15, 2) NOT NULL,
    status VARCHAR(50) NOT NULL
);

-- ── Populate Relationship Managers ──

INSERT INTO relationship_managers (employee_id, region, target_aum) VALUES
(1, 'Mumbai', 50000000.00),
(2, 'Mumbai', 30000000.00);

-- ── Populate Clients ──

INSERT INTO clients (name, aum, rm_id) VALUES
('Reliance Corp', 25000000.00, 1),
('Tata Global', 15000000.00, 1),
('Adani Capital', 18000000.00, 2),
('Birla Mutual', 8000000.00, 2);

-- ── Populate Incentives ──

INSERT INTO incentives (rm_id, quarter, revenue_generated, incentive_earned, status) VALUES
(1, 'Q1 2026', 150000.00, 7500.00, 'approved'),
(1, 'Q2 2026', 220000.00, 11000.00, 'paid'),
(2, 'Q1 2026', 90000.00, 4500.00, 'approved');
