import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, firestoreGet, firestoreSet, createAuthUser } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { idToken, email, password, name, role } = await req.json();

    const decoded = await verifyIdToken(idToken);

    const caller = await firestoreGet(idToken, `users/${decoded.uid}`);
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const newUid = await createAuthUser(email, password, name);

    await firestoreSet(idToken, `users/${newUid}`, {
      uid: newUid,
      email,
      name,
      role: role || 'rm',
      createdAt: new Date(),
    });

    return NextResponse.json({ uid: newUid });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
