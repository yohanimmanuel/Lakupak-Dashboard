import { NextRequest, NextResponse } from 'next/server';
import { getSecurityHeaders } from '../../../../../utils/auth-security';
import { twilioClient, waFrom, smsFrom } from '../../../../../lib/twilio';
import { otpRateLimiter } from '../../../../../utils/rateLimiter';
import { storeMobileOtp } from '@/lib/mobileOtp';

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' }, 
        { status: 400, headers }
      );
    }
    
    const { phone, countryCode, channel } = body;
    
    // Apply rate limiting EARLY to prevent Twilio costs: 3 OTPs per 5 minutes per phone
    if (phone) {
      const rateLimitResponse = await otpRateLimiter(req, phone);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }
    
    // Validate input
    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { error: 'Phone number is required' }, 
        { status: 400, headers }
      );
    }
    
    if (!countryCode || typeof countryCode !== 'string') {
      return NextResponse.json(
        { error: 'Country code is required' }, 
        { status: 400, headers }
      );
    }
    
    // Basic phone validation
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 8 || cleanPhone.length > 15) {
      return NextResponse.json(
        { error: 'Invalid phone number format' }, 
        { status: 400, headers }
      );
    }
    
    // Generate OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;

    const persistOtp = async (deliveryChannel: string) => {
      await storeMobileOtp({
        phone,
        countryCode,
        channel: deliveryChannel,
        code: otpCode,
        ipAddress,
      });
    };

    // Send OTP via Twilio WhatsApp
    if (channel === 'whatsapp' && twilioClient && waFrom) {
      try {
        // The phone parameter already includes the country code (e.g., "+6586548867")
        // So we just need to add the whatsapp: prefix
        const whatsappPhone = `whatsapp:${phone}`;
        const message = `Your Laku verification code is: ${otpCode}. This code expires in 10 minutes.`;
        
        await twilioClient.messages.create({
          from: waFrom,
          to: whatsappPhone,
          body: message
        });

        await persistOtp('whatsapp');
        
        return NextResponse.json({
          ok: true,
          message: `OTP sent to ${countryCode}${phone} via WhatsApp`
        }, {
          status: 200, 
          headers: {
            ...headers,
            'Cache-Control': 'no-store, no-cache, must-revalidate, private'
          }
        });
        
      } catch (twilioError) {
        return NextResponse.json(
          { error: 'Failed to send WhatsApp OTP. Please try again.' }, 
          { status: 500, headers }
        );
      }
    }
    
    // Fallback for SMS or if WhatsApp not configured
    if (twilioClient && smsFrom) {
      try {
        // The phone parameter already includes the country code (e.g., "+6586548867")
        // So we can use it directly for SMS
        const smsPhone = phone;
        const message = `Your Laku verification code is: ${otpCode}. This code expires in 10 minutes.`;
        
        await twilioClient.messages.create({
          from: smsFrom,
          to: smsPhone,
          body: message
        });

        await persistOtp('sms');
        
        return NextResponse.json({
          ok: true,
          message: `OTP sent to ${countryCode}${phone} via SMS`
        }, {
          status: 200, 
          headers: {
            ...headers,
            'Cache-Control': 'no-store, no-cache, must-revalidate, private'
          }
        });
        
      } catch (twilioError) {
        return NextResponse.json(
          { error: 'Failed to send SMS OTP. Please try again.' }, 
          { status: 500, headers }
        );
      }
    }
    
    // If Twilio not configured, return error
    return NextResponse.json(
      { error: 'OTP service not configured. Please contact support.' }, 
      { status: 500, headers }
    );
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to send OTP. Please try again.' }, 
      { status: 500, headers }
    );
  }
}