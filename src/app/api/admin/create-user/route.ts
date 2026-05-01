import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { idToken, email, password, name, role } = await req.json();

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);

    const db = getAdminDb();
    const callerSnap = await db.collection('users').doc(decoded.uid).get();
    if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const newUser = await adminAuth.createUser({ email, password, displayName: name });

    await db.collection('users').doc(newUser.uid).set({
      uid: newUser.uid, email, name, role: role || 'rm', createdAt: new Date(),
    });

    return NextResponse.json({ uid: newUser.uid });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
