import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
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
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  try {
    const db = await getDb();
    const user = await db.get('SELECT * FROM User WHERE email = ?', email);
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    const valid = await compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
