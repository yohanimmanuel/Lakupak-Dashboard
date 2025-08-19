import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';

// Always resolve .data relative to project root
const dataDir = path.resolve(process.cwd(), '.data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, 'lakulaku.db');

export async function initDb() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // User table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS User (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      company TEXT,
      address TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Buyer table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Buyer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyerId TEXT NOT NULL UNIQUE,
      avatar TEXT,
      owner TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      storeName TEXT NOT NULL,
      businessType TEXT NOT NULL,
      address TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      logistics TEXT,
      notes TEXT,
      orderDetails TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      userId INTEGER,
      FOREIGN KEY (userId) REFERENCES User(id)
    );
  `);

  // Supplier table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Supplier (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplierId TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      businessType TEXT NOT NULL,
      address TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      logistics TEXT,
      notes TEXT,
      supplies TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      userId INTEGER,
      FOREIGN KEY (userId) REFERENCES User(id)
    );
  `);

  await db.close();
}

// Helper to ensure tables exist before any DB operation
export async function ensureDbInitialized() {
  await initDb();
}

// To run directly (for testing/setup)
if (require.main === module) {
  initDb().then(() => {
    console.log('Database and tables initialized!');
  });
}
