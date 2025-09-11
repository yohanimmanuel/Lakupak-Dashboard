import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (!auth) return null
  const [type, token] = auth.split(' ')
  if (type !== 'Bearer' || !token) return null
  return token
}

function getUserIdFromToken(token: string): number | null {
  // Extract user ID from mobile token format: mobile_token_{id}_{timestamp}
  const tokenMatch = token.match(/^mobile_token_(\d+)_\d+$/)
  if (!tokenMatch) return null
  return parseInt(tokenMatch[1])
}

export async function GET(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const userId = getUserIdFromToken(token)
  if (!userId) return NextResponse.json({ error: 'Invalid token format' }, { status: 401 })
  
  const list = await prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(list)
}

export async function POST(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const userId = getUserIdFromToken(token)
  if (!userId) return NextResponse.json({ error: 'Invalid token format' }, { status: 401 })
  
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
  
  const userId = getUserIdFromToken(token)
  if (!userId) return NextResponse.json({ error: 'Invalid token format' }, { status: 401 })
  
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
  
  const userId = getUserIdFromToken(token)
  if (!userId) return NextResponse.json({ error: 'Invalid token format' }, { status: 401 })
  
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


