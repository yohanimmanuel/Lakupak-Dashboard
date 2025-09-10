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
    return NextResponse.json({ id: user.id, username: user.username, name: user.name, storeName: user.storeName, email: user.email, phone: user.phone, image: user.image, bannerImage: user.bannerImage, chosenAddress: user.chosenAddress, country: user.country, bio: user.bio }, {
      headers: {
        'Cache-Control': 'private, max-age=300', // 5 minutes cache
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
      }
    })
  } catch (err) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// Input sanitization helper
function sanitizeInput(input: string | undefined): string | undefined {
  if (!input) return undefined
  return input.trim().slice(0, 500) // Limit length and trim whitespace
}

export async function PATCH(req: NextRequest) {
  try {
    const token = getToken(req)
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = verifyAccessToken(token)
    const body = await req.json()
    
    // Sanitize all string inputs
    const sanitizedData = {
      username: sanitizeInput(body.username),
      name: sanitizeInput(body.name),
      storeName: sanitizeInput(body.storeName),
      email: sanitizeInput(body.email),
      bio: sanitizeInput(body.bio),
      phone: sanitizeInput(body.phone),
      image: sanitizeInput(body.image),
      bannerImage: sanitizeInput(body.bannerImage),
      chosenAddress: sanitizeInput(body.chosenAddress),
      country: sanitizeInput(body.country),
    }
    
    const updated = await prisma.marketplaceUser.update({
      where: { id: payload.sub },
      data: sanitizedData,
      select: { id: true, username: true, name: true, storeName: true, email: true, phone: true, image: true, bannerImage: true, chosenAddress: true, country: true, bio: true },
    })
    
    return NextResponse.json(updated, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Update failed', message: err?.message || '' }, { status: 500 })
  }
}


