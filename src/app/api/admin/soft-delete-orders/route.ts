import { NextRequest, NextResponse } from 'next/server';
import { softDeleteCancelledOrders } from '@/scripts/soft-delete-cancelled-orders';

/**
 * Admin endpoint to manually trigger soft delete of cancelled orders
 * This should be protected with admin authentication in production
 */
export async function POST(request: NextRequest) {
  try {
    // In production, add admin authentication here
    // const isAdmin = await checkAdminAuth(request);
    // if (!isAdmin) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }
    
    await softDeleteCancelledOrders();
    
    return NextResponse.json({ 
      success: true, 
      message: 'Soft delete process completed successfully' 
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to run soft delete process' },
      { status: 500 }
    );
  }
}
