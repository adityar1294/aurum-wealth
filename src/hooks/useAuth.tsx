'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { isFirebaseConfigured, getClientAuth, getClientDb } from '@/lib/firebase';
import { User } from '@/lib/types';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  user: null,
  loading: true,
  configured: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const auth = getClientAuth();
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        const loadUserDoc = async (retries = 2): Promise<void> => {
          try {
            const db = getClientDb();
            const snap = await getDoc(doc(db, 'users', fbUser.uid));
            if (snap.exists()) {
              const data = snap.data();
              setUser({
                uid: fbUser.uid,
                email: data.email,
                name: data.name,
                role: data.role,
                createdAt: data.createdAt?.toDate?.() || new Date(),
                rmId: data.rmId,
                clientId: data.clientId,
              });
            } else if (retries > 0) {
              // Doc may not be written yet (race after account creation) — retry
              await new Promise((r) => setTimeout(r, 1500));
              return loadUserDoc(retries - 1);
            } else {
              setUser(null);
            }
          } catch (err) {
            console.error('[useAuth] Firestore fetch failed:', err);
            setUser(null);
          }
          setLoading(false);
        };
        loadUserDoc();
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [configured]);

  const signOut = async () => {
    if (!configured) return;
    await firebaseSignOut(getClientAuth());
    setUser(null);
    setFirebaseUser(null);
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, user, loading, configured, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
