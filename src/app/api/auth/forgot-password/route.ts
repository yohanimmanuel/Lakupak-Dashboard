import { NextRequest, NextResponse } from 'next/server';
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
  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 });
  }
  try {
    const db = await getDb();
    const user = await db.get('SELECT * FROM User WHERE email = ?', email);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    // In production, generate a token and send email here
    return NextResponse.json({ message: 'If this email exists, a reset link will be sent.' }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
