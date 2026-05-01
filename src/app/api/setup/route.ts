import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, firestoreCount, firestoreSet } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { idToken, name } = await req.json();
    if (!idToken) return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });

    const decoded = await verifyIdToken(idToken);

    const count = await firestoreCount(idToken, 'users');
    if (count > 0) return NextResponse.json({ error: 'Setup already complete' }, { status: 403 });

    await firestoreSet(idToken, `users/${decoded.uid}`, {
      uid: decoded.uid,
      email: decoded.email,
      name: name || decoded.email,
      role: 'admin',
      createdAt: new Date(),
    });

    await firestoreSet(idToken, '_setup/complete', { doneAt: new Date() });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Setup error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
