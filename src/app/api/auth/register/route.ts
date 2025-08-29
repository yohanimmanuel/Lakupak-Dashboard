import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../../../../generated/prisma';
import { 
  validateAuthInput, 
  getSecurityHeaders, 
  sanitizeUserData 
} from '../../../../utils/auth-security';

const prisma = new PrismaClient();

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
    
    const { firstName, lastName, email, password, company, address } = body;
    
    // Validate all inputs
    const firstNameValidation = validateAuthInput.name(firstName, 'First name');
    if (!firstNameValidation.valid) {
      return NextResponse.json(
        { error: firstNameValidation.error }, 
        { status: 400, headers }
      );
    }
    
    const lastNameValidation = validateAuthInput.name(lastName, 'Last name');
    if (!lastNameValidation.valid) {
      return NextResponse.json(
        { error: lastNameValidation.error }, 
        { status: 400, headers }
      );
    }
    
    const emailValidation = validateAuthInput.email(email);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: emailValidation.error }, 
        { status: 400, headers }
      );
    }
    
    const passwordValidation = validateAuthInput.password(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.error }, 
        { status: 400, headers }
      );
    }
    
    const companyValidation = validateAuthInput.company(company);
    if (!companyValidation.valid) {
      return NextResponse.json(
        { error: companyValidation.error }, 
        { status: 400, headers }
      );
    }
    
    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      return NextResponse.json(
        { error: 'Company address is required' }, 
        { status: 400, headers }
      );
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    
    // Check for existing user
    const existing = await prisma.user.findUnique({ 
      where: { email: normalizedEmail } 
    });
    
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' }, 
        { status: 409, headers }
      );
    }
    
    // Hash password with stronger salt rounds for production
    const hashed = await hash(password, 12);
    
    // Create user with sanitized data
    const user = await prisma.user.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        password: hashed,
        company: company.trim(),
        address: address.trim()
      }
    });
    
    // Return sanitized user data
    const userData = sanitizeUserData(user);
    
    return NextResponse.json(userData, { 
      status: 201, 
      headers: {
        ...headers,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle known database errors gracefully
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'An account with this email already exists' }, 
        { status: 409, headers }
      );
    }
    
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' }, 
      { status: 500, headers }
    );
  }
}
