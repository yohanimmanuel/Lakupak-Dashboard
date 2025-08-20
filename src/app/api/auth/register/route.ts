import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../../../../generated/prisma';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  const { firstName, lastName, email, password, company, address } = await req.json();
  if (!firstName || !lastName || !email || !password || !company || !address) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }
    const hashed = await hash(password, 10);
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashed,
        company,
        address
      }
    });
    return NextResponse.json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email
    }, { status: 201 });
  } catch (err) {
    console.error('Registration error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
