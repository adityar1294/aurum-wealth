import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const db = getAdminDb();

    const usersSnap = await db.collection('users').limit(1).get();
    if (!usersSnap.empty) {
      return NextResponse.json({ error: 'Setup already complete' }, { status: 403 });
    }

    const body = await req.json();
    const { idToken, name } = body;

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);

    await db.collection('users').doc(decoded.uid).set({
      uid: decoded.uid,
      email: decoded.email,
      name: name || decoded.email,
      role: 'admin',
      createdAt: new Date(),
    });

    await db.collection('_setup').doc('complete').set({ doneAt: new Date() });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Setup error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
