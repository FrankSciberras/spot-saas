import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Health check endpoint for the splash screen preloader.
 * Returns a simple OK response to verify the server is ready.
 */
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    timestamp: Date.now()
  });
}
