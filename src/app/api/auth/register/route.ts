import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { ensureDbInitialized } from '../../../../database/initDb';

const dbPath = path.resolve(process.cwd(), '.data/lakulaku.db');
async function getDb() {
  return open({ filename: dbPath, driver: sqlite3.Database });
}

export async function POST(req: NextRequest) {
  await ensureDbInitialized();
  const { firstName, lastName, email, password, company, address } = await req.json();
  if (!firstName || !lastName || !email || !password || !company || !address) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  try {
    const db = await getDb();
    const existing = await db.get('SELECT * FROM User WHERE email = ?', email);
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }
    const hashed = await hash(password, 10);
    const result = await db.run(
      `INSERT INTO User (firstName, lastName, email, password, company, address) VALUES (?, ?, ?, ?, ?, ?)`,
      [firstName, lastName, email, hashed, company, address]
    );
    const user = await db.get('SELECT id, firstName, lastName, email FROM User WHERE id = ?', result.lastID);
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    console.error('Registration error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
