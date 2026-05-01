'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else if (user.role === 'client') {
      router.replace('/portal');
    } else {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  return (
    <div className="loading-center" style={{ height: '100vh' }}>
      <div className="spinner spinner-lg" />
    </div>
  );
}
