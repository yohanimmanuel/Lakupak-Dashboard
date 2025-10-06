import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (!auth) return null
  const [type, token] = auth.split(' ')
  if (type !== 'Bearer' || !token) return null
  return token
}

async function getUserIdFromToken(token: string): Promise<number | null> {
  try {
    const { verifyAccessToken } = await import('../../../../lib/jwt')
    const payload = verifyAccessToken(token)
    return typeof payload.sub === 'number' ? payload.sub : null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const userId = await getUserIdFromToken(token)
  if (!userId) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  
  const list = await prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(list)
}

export async function POST(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const userId = await getUserIdFromToken(token)
  if (!userId) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  
  const body = await req.json()
  const created = await prisma.$transaction(async (tx) => {
    const createdAddr = await tx.address.create({
      data: {
        userId,
        fullName: body.fullName,
        phone: body.phone,
        address: body.address,
        isDefault: !!body.isDefault,
        label: body.label || 'home',
      },
    })
    if (createdAddr.isDefault) {
      await tx.address.updateMany({ where: { userId, NOT: { id: createdAddr.id } }, data: { isDefault: false } })
      await tx.marketplaceUser.update({ where: { id: userId }, data: { chosenAddress: createdAddr.address } })
    }
    return createdAddr
  })
  return NextResponse.json(created, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const userId = await getUserIdFromToken(token)
  if (!userId) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  
  const body = await req.json()
  const updated = await prisma.$transaction(async (tx) => {
    const upd = await tx.address.update({
      where: { id: body.id },
      data: {
        fullName: body.fullName ?? undefined,
        phone: body.phone ?? undefined,
        address: body.address ?? undefined,
        isDefault: body.isDefault ?? undefined,
        label: body.label ?? undefined,
      },
    })
    if (body.isDefault === true) {
      await tx.address.updateMany({ where: { userId, NOT: { id: upd.id } }, data: { isDefault: false } })
      await tx.marketplaceUser.update({ where: { id: userId }, data: { chosenAddress: upd.address } })
    }
    return upd
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const userId = await getUserIdFromToken(token)
  if (!userId) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  
  const body = await req.json()
  const id: number | undefined = body?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const deleted = await prisma.$transaction(async (tx) => {
    const addr = await tx.address.findUnique({ where: { id } })
    if (!addr || addr.userId !== userId) throw new Error('Not found')
    await tx.address.delete({ where: { id } })
    if (addr.isDefault) {
      await tx.marketplaceUser.update({ where: { id: userId }, data: { chosenAddress: null } })
    }
    return addr
  })
  return NextResponse.json({ ok: true, deletedId: deleted.id })
}


