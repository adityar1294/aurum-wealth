'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  MessageSquare,
  Settings,
  LogOut,
  BarChart3,
  TrendingUp,
  Globe,
  Flame,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  roles?: Array<'admin' | 'rm' | 'client'>;
}

const NAV: NavItem[] = [
  { href: '/dashboard', icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
  { href: '/clients', icon: <Users size={16} />, label: 'Clients' },
  { href: '/tasks', icon: <CheckSquare size={16} />, label: 'Tasks' },
  { href: '/interactions', icon: <MessageSquare size={16} />, label: 'Interactions' },
];

const TOOLS: NavItem[] = [
  { href: '/tools/planner', icon: <BarChart3 size={16} />, label: 'Financial Planner' },
  { href: '/tools/portfolio', icon: <TrendingUp size={16} />, label: 'Portfolio Analysis' },
  { href: '/tools/market', icon: <Globe size={16} />, label: 'Market' },
];

const ADMIN: NavItem[] = [
  { href: '/admin/users', icon: <Settings size={16} />, label: 'Users', roles: ['admin'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [game, setGame] = useState({ streak: 0, xp: 0 });

  useEffect(() => {
    if (!user) return;
    const loadGame = async () => {
      const db = getClientDb();
      try {
        const snap = await getDocs(
          user.role === 'client' && user.clientId
            ? query(collection(db, 'tasks'), where('clientId', '==', user.clientId), where('status', '==', 'completed'))
            : user.role === 'admin'
              ? query(collection(db, 'tasks'), where('status', '==', 'completed'))
              : query(collection(db, 'tasks'), where('rmId', '==', user.uid), where('status', '==', 'completed'))
        );

        const completedDays = new Set<string>();
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const rawDate = data.completedAt || data.dueDate;
          const date = rawDate?.toDate?.() || (rawDate ? new Date(rawDate) : null);
          if (date && !Number.isNaN(date.getTime())) completedDays.add(date.toISOString().slice(0, 10));
        });

        let streak = 0;
        const cursor = new Date();
        for (let i = 0; i < 14; i += 1) {
          const key = cursor.toISOString().slice(0, 10);
          if (!completedDays.has(key)) break;
          streak += 1;
          cursor.setDate(cursor.getDate() - 1);
        }

        setGame({ streak, xp: snap.size * 10 });
      } catch {
        setGame({ streak: 0, xp: 0 });
      }
    };
    loadGame();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  const initials = (user?.name || user?.email || 'U').charAt(0).toUpperCase();
  const level = Math.max(1, Math.floor(game.xp / 100) + 1);
  const xpIntoLevel = game.xp % 100;
  const segmentCount = useMemo(() => Math.max(1, Math.ceil(xpIntoLevel / 20)), [xpIntoLevel]);

  return (
    <div className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'var(--ink)', color: 'var(--yolk)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 22,
              flexShrink: 0, lineHeight: 1,
            }}
          >
            A
          </div>
          <div>
            <div className="brand-name">Aurum</div>
            <div className="brand-tagline">Wealth Management</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <div className="nav-section-title">Main</div>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${isActive(item.href) ? ' active' : ''}`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}

        <div className="nav-section-title">Tools</div>
        {TOOLS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${isActive(item.href) ? ' active' : ''}`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}

        {user?.role === 'admin' && (
          <>
            <div className="nav-section-title">Admin</div>
            {ADMIN.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item${isActive(item.href) ? ' active' : ''}`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Footer: user card + sign out */}
      <div className="sidebar-footer">
        <div className="sidebar-game-card">
          <div className="sidebar-game-title">
            <span><Flame size={15} color="var(--yolk)" /> {game.streak || 0}-day streak</span>
            <b className="sidebar-level">LV {level}</b>
          </div>
          <div className="sidebar-segments" aria-label={`${xpIntoLevel} XP to next level progress`}>
            {Array.from({ length: 5 }).map((_, i) => <i key={i} className={i < segmentCount ? 'on' : ''} />)}
          </div>
          <div className="sidebar-xp-copy">
            <span>{100 - xpIntoLevel} XP to next level</span>
            <span>{game.xp} XP</span>
          </div>
        </div>
        <div className="user-info">
          <div className="user-avatar">{initials}</div>
          <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
            <div className="user-name">{user?.name || user?.email}</div>
            <div className="user-role">{user?.role?.toUpperCase()}</div>
          </div>
        </div>
        <button
          className="nav-item"
          style={{ width: '100%', background: 'none', border: 'none', marginTop: 4 }}
          onClick={handleSignOut}
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
