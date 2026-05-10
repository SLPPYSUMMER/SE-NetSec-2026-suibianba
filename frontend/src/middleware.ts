import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PATHS = [
  '/dashboard',
  '/vulnerabilities',
  '/scans',
  '/assets',
  '/reports',
  '/team',
  '/settings',
];

const PUBLIC_PATHS = ['/', '/api'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static files
  if (
    pathname === '/' ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|ico|css|js)$/)
  ) {
    return NextResponse.next();
  }

  const sessionId = request.cookies.get('sessionid')?.value;

  if (!sessionId) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
