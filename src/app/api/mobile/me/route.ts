import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken } from '@/lib/jwt'
import { prisma } from '@/lib/db'

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (!auth) return null
  const [type, token] = auth.split(' ')
  if (type !== 'Bearer' || !token) return null
  return token
}

export async function GET(req: NextRequest) {
  try {
    const token = getToken(req)
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = verifyAccessToken(token)
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { marketplace: true } })
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ id: user.id, name: user.name, email: user.email, address: user.address, marketplace: user.marketplace })
  } catch (err) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const token = getToken(req)
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = verifyAccessToken(token)
    const body = await req.json()
    const updated = await prisma.user.update({
      where: { id: payload.sub },
      data: {
        name: body.name ?? undefined,
        address: body.address ?? undefined,
      },
      select: { id: true, name: true, email: true, address: true },
    })
    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}


