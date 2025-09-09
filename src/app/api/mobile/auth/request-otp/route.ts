import { NextRequest, NextResponse } from 'next/server'
import { twilioClient, smsFrom, waFrom } from '@/lib/twilio'
import { prisma } from '@/lib/db'

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(req: NextRequest) {
  try {
    const { phone, countryCode, channel } = await req.json()
    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 })
    }
    const normalizedChannel = channel === 'whatsapp' ? 'whatsapp' : 'sms'

    if (!twilioClient) {
      return NextResponse.json({ error: 'Twilio client not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.' }, { status: 500 })
    }

    const code = generateOtp()

    // Prefer Twilio Verify if configured
    // Prefer Verify for SMS. For WhatsApp sandbox, use Messaging API + store OTP in DB.
    if (process.env.TWILIO_VERIFY_SID && normalizedChannel !== 'whatsapp') {
      await twilioClient.verify.v2.services(process.env.TWILIO_VERIFY_SID).verifications.create({ to: phone.startsWith('+') ? phone : `+${phone}`, channel: 'sms' as any })
      return NextResponse.json({ ok: true })
    } else {
      // Fallback to direct messaging if Verify is not set
      const to = normalizedChannel === 'whatsapp' ? `whatsapp:${phone}` : phone
      const from = normalizedChannel === 'whatsapp' ? waFrom : smsFrom
      if (!from) {
        return NextResponse.json({ error: 'Twilio FROM not configured (set TWILIO_WHATSAPP_FROM or TWILIO_SMS_FROM)' }, { status: 500 })
      }
      try {
        const msg = await twilioClient.messages.create({ to, from, body: `Your Laku-Laku verification code: ${code}` })
        // Persist OTP for verification (5 minutes)
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
        await prisma.otpCode.create({
          data: {
            phone,
            countryCode: countryCode ?? null,
            channel: normalizedChannel,
            code,
            expiresAt,
            ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
          },
        })
        return NextResponse.json({ ok: true, sid: msg.sid })
      } catch (e: any) {
        const errMsg = e?.message || 'Twilio send failed'
        const errCode = e?.code || 'unknown'
        return NextResponse.json({ error: 'TWILIO_SEND_FAILED', message: errMsg, code: errCode }, { status: 502 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}


