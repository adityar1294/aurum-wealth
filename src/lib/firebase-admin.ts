// Firebase Admin SDK replaced with REST API calls — no service account key required.
// Token verification uses Firebase's public tokeninfo endpoint.
// Firestore writes use the Firebase REST API with the user's ID token.

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/** Verify a Firebase ID token and return the decoded payload. */
export async function verifyIdToken(idToken: string): Promise<{ uid: string; email: string }> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) throw new Error('Invalid ID token');
  const data = await res.json();
  const user = data.users?.[0];
  if (!user) throw new Error('User not found');
  return { uid: user.localId, email: user.email };
}

/** Read a Firestore document using a user's ID token for auth. */
export async function firestoreGet(idToken: string, path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET failed: ${res.status}`);
  const doc = await res.json();
  return firestoreDocToObject(doc);
}

/** Write a Firestore document using a user's ID token (PATCH = upsert). */
export async function firestoreSet(idToken: string, path: string, data: Record<string, unknown>): Promise<void> {
  const body = { fields: objectToFirestoreFields(data) };
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore SET failed: ${err}`);
  }
}

/** Query a Firestore collection (limit 1) using a user's ID token. */
export async function firestoreCount(idToken: string, collection: string): Promise<number> {
  const res = await fetch(`${FIRESTORE_BASE}/${collection}?pageSize=1`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.documents?.length ?? 0;
}

/** Create a Firebase Auth user via REST API (admin creates new RM accounts). */
export async function createAuthUser(email: string, password: string, displayName: string): Promise<string> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName, returnSecureToken: false }),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Failed to create user');
  }
  const data = await res.json();
  return data.localId;
}

// ── Firestore REST serialization helpers ────────────────────────────────────

function objectToFirestoreFields(obj: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

function toFirestoreValue(v: unknown): unknown {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') return { mapValue: { fields: objectToFirestoreFields(v as Record<string, unknown>) } };
  return { stringValue: String(v) };
}

function firestoreDocToObject(doc: Record<string, unknown>): Record<string, unknown> {
  const fields = (doc.fields || {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    result[k] = fromFirestoreValue(v as Record<string, unknown>);
  }
  return result;
}

function fromFirestoreValue(v: Record<string, unknown>): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return new Date(v.timestampValue as string);
  if ('arrayValue' in v) return ((v.arrayValue as Record<string, unknown>)?.values as unknown[] || []).map((i) => fromFirestoreValue(i as Record<string, unknown>));
  if ('mapValue' in v) return firestoreDocToObject(v.mapValue as Record<string, unknown>);
  return null;
}
