import { NextRequest, NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { ensureDbInitialized } from '../../../database/initDb';

const dbPath = path.resolve(process.cwd(), '.data/lakulaku.db');

function parseBuyerJsonFields(buyer: any) {
  if (!buyer) return buyer;
  ['orderDetails', 'notes', 'logistics'].forEach(field => {
    if (buyer[field] && typeof buyer[field] === 'string') {
      try { buyer[field] = JSON.parse(buyer[field]); } catch { buyer[field] = []; }
    }
  });
  return buyer;
}

function stringifyBuyerJsonFields(data: any) {
  const result = { ...data };
  ['orderDetails', 'notes', 'logistics'].forEach(field => {
    if (result[field] && typeof result[field] !== 'string') {
      result[field] = JSON.stringify(result[field]);
    }
  });
  return result;
}

async function getDb() {
  return open({ filename: dbPath, driver: sqlite3.Database });
}

export async function GET(req: NextRequest) {
  await ensureDbInitialized();
  try {
    const db = await getDb();
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      let buyer;
      if (/^\d+$/.test(id)) {
        buyer = await db.get('SELECT * FROM Buyer WHERE id = ? AND userId = ?', Number(id), userId);
      } else {
        buyer = await db.get('SELECT * FROM Buyer WHERE buyerId = ? AND userId = ?', id, userId);
      }
      buyer = parseBuyerJsonFields(buyer);
      if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
      return NextResponse.json(buyer);
    }
    const buyers = await db.all('SELECT * FROM Buyer WHERE userId = ?', userId);
    return NextResponse.json(buyers.map(parseBuyerJsonFields));
  } catch (err) {
    console.error('GET /api/buyers error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await ensureDbInitialized();
  try {
    const db = await getDb();
    let data = await req.json();
    if (!data.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    data = stringifyBuyerJsonFields(data);
    const keys = Object.keys(data);
    const values = keys.map(k => data[k]);
    const placeholders = keys.map(() => '?').join(',');
    const sql = `INSERT INTO Buyer (${keys.join(',')}) VALUES (${placeholders})`;
    const result = await db.run(sql, values);
    let buyer = await db.get('SELECT * FROM Buyer WHERE id = ?', result.lastID);
    buyer = parseBuyerJsonFields(buyer);
    return NextResponse.json(buyer, { status: 201 });
  } catch (err) {
    console.error('POST /api/buyers error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  await ensureDbInitialized();
  try {
    const db = await getDb();
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    let deleted;
    let result;
    if (/^\d+$/.test(id)) {
      deleted = await db.get('SELECT * FROM Buyer WHERE id = ? AND userId = ?', Number(id), userId);
      result = await db.run('DELETE FROM Buyer WHERE id = ? AND userId = ?', Number(id), userId);
    } else {
      deleted = await db.get('SELECT * FROM Buyer WHERE buyerId = ? AND userId = ?', id, userId);
      result = await db.run('DELETE FROM Buyer WHERE buyerId = ? AND userId = ?', id, userId);
    }
    console.log('DELETE Buyer', { id, userId, deleted, changes: result?.changes });
    if (result?.changes === 0) {
      return NextResponse.json({ error: 'No record deleted. Check id and userId.' }, { status: 404 });
    }
    deleted = parseBuyerJsonFields(deleted);
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    console.error('DELETE /api/buyers error:', err);
    return NextResponse.json({ error: 'Failed to delete buyer' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  await ensureDbInitialized();
  try {
    const db = await getDb();
    let data = await req.json();
    if (!data.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    const { id, buyerId, userId, ...updateData } = stringifyBuyerJsonFields(data);
    const keys = Object.keys(updateData);
    const values = keys.map(k => updateData[k]);
    let where, whereVal;
    if (id) {
      where = 'id = ? AND userId = ?';
      whereVal = [Number(id), userId];
    } else if (buyerId) {
      where = 'buyerId = ? AND userId = ?';
      whereVal = [String(buyerId), userId];
    } else {
      return NextResponse.json({ error: 'Missing id or buyerId' }, { status: 400 });
    }
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    await db.run(`UPDATE Buyer SET ${setClause} WHERE ${where}`, ...values, ...whereVal);
    let buyer = await db.get(`SELECT * FROM Buyer WHERE ${where}`, ...whereVal);
    buyer = parseBuyerJsonFields(buyer);
    return NextResponse.json(buyer);
  } catch (err) {
    console.error('PUT /api/buyers error:', err);
    return NextResponse.json({ error: 'Failed to update buyer' }, { status: 500 });
  }
}
