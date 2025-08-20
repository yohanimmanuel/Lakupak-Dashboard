import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../../../../generated/prisma';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const hashed = await hash(password, 10);
    await prisma.user.update({ 
      where: { email }, 
      data: { password: hashed } 
    });
    return NextResponse.json({ message: 'Password reset successful' }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
