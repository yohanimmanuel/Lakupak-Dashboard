import Twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
export const smsFrom = process.env.TWILIO_SMS_FROM
export const waFrom = process.env.TWILIO_WHATSAPP_FROM

export const twilioClient: Twilio.Twilio | null = accountSid && authToken ? Twilio(accountSid, authToken) : null


