import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { twilioClient } from '@/lib/twilio'
import { signAccessToken } from '@/lib/jwt'


export async function POST(req: NextRequest) {
  try {
    const { phone, countryCode, code, profile, mode } = await req.json()
    if (!phone || !code) {
      return NextResponse.json({ error: 'phone and code are required' }, { status: 400 })
    }

    let verified = false

    // 1) Try DB-backed OTP first (used for WhatsApp sandbox/Messaging API)
    try {
      const now = new Date()
      const otp = await prisma.otpCode.findFirst({
        where: { phone, code, expiresAt: { gt: now }, consumedAt: null },
        orderBy: { createdAt: 'desc' },
      })
      if (otp) {
        await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: now } })
        verified = true
      }
    } catch (e) {
      // Continue to Verify fallback
    }

    // 2) If not verified yet, try Twilio Verify
    if (!verified && twilioClient && process.env.TWILIO_VERIFY_SID) {
      try {
        const check = await twilioClient.verify.v2
          .services(process.env.TWILIO_VERIFY_SID)
          .verificationChecks.create({ to: phone.startsWith('+') ? phone : `+${phone}`, code })
        verified = check.status === 'approved'
      } catch (e: any) {
        // expose verify error for debugging
        return NextResponse.json({ error: 'VERIFY_CHECK_FAILED', message: e?.message || 'verify error' }, { status: 502 })
      }
    }

    if (!verified) return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 })

    // Marketplace user channel (separate from SaaS User)
    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`
    const randomSuffix = Math.floor(10000000 + Math.random() * 90000000).toString()
    const username = `user${randomSuffix}`

    // always look up by phone for phone-based registration/login
    let muser = await prisma.marketplaceUser.findUnique({ where: { phone: normalizedPhone } })
    if (mode === 'login') {
      if (!muser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
      // no profile field updates on login for phone-only flow
    } else {
      muser = await prisma.marketplaceUser.create({
        data: {
          username,
          phone: normalizedPhone,
        },
      })
    }

    const token = signAccessToken({ sub: muser.id, phone: normalizedPhone })
    return NextResponse.json({ token, user: { id: muser.id, username: muser.username, email: muser.email, phone: muser.phone, address: muser.address, country: muser.country, createdAt: muser.createdAt, updatedAt: muser.updatedAt } })
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal Server Error', message: err?.message || '' }, { status: 500 })
  }
}


