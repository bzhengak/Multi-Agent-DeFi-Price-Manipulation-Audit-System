import { isAuthenticated } from './jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Wrap an API route handler with authentication check.
 * If the user is not authenticated, returns a 401 JSON response.
 * Otherwise, executes the provided handler.
 */
export async function withAuth(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return NextResponse.json(
      { error: 'Unauthorized access', message: 'Authentication required' },
      { status: 401 }
    );
  }

  return handler();
}
