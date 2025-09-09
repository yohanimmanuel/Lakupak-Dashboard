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

    // Upsert or find user by synthetic email derived from phone for mobile accounts
    const email = profile?.email ?? undefined
    const name = profile?.name ?? undefined
    const address = profile?.address ?? undefined

    const mobileEmail = email ?? `${phone}@mobile.lakulaku`
    let user = await prisma.user.findUnique({ where: { email: mobileEmail } })

    if (mode === 'login') {
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
    } else {
      // signup or default: create or update
      user = await prisma.user.upsert({
        where: { email: mobileEmail },
        update: { name: name ?? undefined, address: address ?? undefined },
        create: { email: mobileEmail, name: name ?? undefined, address: address ?? undefined },
      })
    }

    // Ensure MarketplaceProfile exists and is linked
    await prisma.marketplaceProfile.upsert({
      where: { userId: user.id },
      update: { phone: phone.startsWith('+') ? phone : `+${phone}`, country: countryCode ?? undefined },
      create: { userId: user.id, phone: phone.startsWith('+') ? phone : `+${phone}`, country: countryCode ?? undefined },
    })

    const token = signAccessToken({ sub: user.id, phone })
    return NextResponse.json({ token, user: { id: user.id, name: user.name, email: user.email, address: user.address } })
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal Server Error', message: err?.message || '' }, { status: 500 })
  }
}


