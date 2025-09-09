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
    const user = await prisma.marketplaceUser.findUnique({ where: { id: payload.sub } })
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ id: user.id, username: user.username, email: user.email, phone: user.phone, address: user.address, country: user.country, bio: user.bio })
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
    const updated = await prisma.marketplaceUser.update({
      where: { id: payload.sub },
      data: {
        username: body.username ?? undefined,
        email: body.email ?? undefined,
        bio: body.bio ?? undefined,
        phone: body.phone ?? undefined,
        address: body.address ?? undefined,
        country: body.country ?? undefined,
      },
      select: { id: true, username: true, email: true, phone: true, address: true, country: true, bio: true },
    })
    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}


