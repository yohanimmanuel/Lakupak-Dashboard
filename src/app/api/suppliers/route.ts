import { NextRequest, NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { ensureDbInitialized } from '../../../database/initDb';

const dbPath = path.resolve(process.cwd(), '.data/lakulaku.db');

function parseSupplierJsonFields(supplier: any) {
  if (!supplier) return supplier;
  ['supplies', 'notes', 'logistics'].forEach(field => {
    if (supplier[field] && typeof supplier[field] === 'string') {
      try { supplier[field] = JSON.parse(supplier[field]); } catch { supplier[field] = []; }
    }
  });
  return supplier;
}

function stringifySupplierJsonFields(data: any) {
  const result = { ...data };
  ['supplies', 'notes', 'logistics'].forEach(field => {
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
      let supplier;
      if (/^\d+$/.test(id)) {
        supplier = await db.get('SELECT * FROM Supplier WHERE id = ? AND userId = ?', Number(id), userId);
      } else {
        supplier = await db.get('SELECT * FROM Supplier WHERE supplierId = ? AND userId = ?', id, userId);
      }
      supplier = parseSupplierJsonFields(supplier);
      if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
      return NextResponse.json(supplier);
    }
    const suppliers = await db.all('SELECT * FROM Supplier WHERE userId = ?', userId);
    return NextResponse.json(suppliers.map(parseSupplierJsonFields));
  } catch (err) {
    console.error('GET /api/suppliers error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await ensureDbInitialized();
  try {
    const db = await getDb();
    let data = await req.json();
    if (!data.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    data = stringifySupplierJsonFields(data);
    const keys = Object.keys(data);
    const values = keys.map(k => data[k]);
    const placeholders = keys.map(() => '?').join(',');
    const sql = `INSERT INTO Supplier (${keys.join(',')}) VALUES (${placeholders})`;
    const result = await db.run(sql, values);
    let supplier = await db.get('SELECT * FROM Supplier WHERE id = ?', result.lastID);
    supplier = parseSupplierJsonFields(supplier);
    return NextResponse.json(supplier, { status: 201 });
  } catch (err) {
    console.error('POST /api/suppliers error:', err);
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
      deleted = await db.get('SELECT * FROM Supplier WHERE id = ? AND userId = ?', Number(id), userId);
      result = await db.run('DELETE FROM Supplier WHERE id = ? AND userId = ?', Number(id), userId);
    } else {
      deleted = await db.get('SELECT * FROM Supplier WHERE supplierId = ? AND userId = ?', id, userId);
      result = await db.run('DELETE FROM Supplier WHERE supplierId = ? AND userId = ?', id, userId);
    }
    console.log('DELETE Supplier', { id, userId, deleted, changes: result?.changes });
    if (result?.changes === 0) {
      return NextResponse.json({ error: 'No record deleted. Check id and userId.' }, { status: 404 });
    }
    deleted = parseSupplierJsonFields(deleted);
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    console.error('DELETE /api/suppliers error:', err);
    return NextResponse.json({ error: 'Failed to delete supplier' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  await ensureDbInitialized();
  try {
    const db = await getDb();
    let data = await req.json();
    if (!data.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    const { id, supplierId, userId, ...updateData } = stringifySupplierJsonFields(data);
    const keys = Object.keys(updateData);
    const values = keys.map(k => updateData[k]);
    let where, whereVal;
    if (id) {
      where = 'id = ? AND userId = ?';
      whereVal = [Number(id), userId];
    } else if (supplierId) {
      where = 'supplierId = ? AND userId = ?';
      whereVal = [String(supplierId), userId];
    } else {
      return NextResponse.json({ error: 'Missing id or supplierId' }, { status: 400 });
    }
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    await db.run(`UPDATE Supplier SET ${setClause} WHERE ${where}`, ...values, ...whereVal);
    let supplier = await db.get(`SELECT * FROM Supplier WHERE ${where}`, ...whereVal);
    supplier = parseSupplierJsonFields(supplier);
    return NextResponse.json(supplier);
  } catch (err) {
    console.error('PUT /api/suppliers error:', err);
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 });
  }
}
