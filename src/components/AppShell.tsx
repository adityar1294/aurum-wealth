'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Sidebar from './Sidebar';
import MarketBanner from './MarketBanner';

interface Props {
  children: React.ReactNode;
  requireRole?: 'admin' | 'rm' | 'client';
}

export default function AppShell({ children, requireRole }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (requireRole && user.role !== requireRole && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, loading, router, requireRole]);

  if (loading) {
    return (
      <div className="loading-center" style={{ height: '100vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <MarketBanner />
        {children}
      </div>
    </div>
  );
}
