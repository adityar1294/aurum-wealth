'use client';
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
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

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
  { href: '/tools/market', icon: <Globe size={16} />, label: 'Market Research' },
];

const ADMIN: NavItem[] = [
  { href: '/admin/users', icon: <Settings size={16} />, label: 'Users', roles: ['admin'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  const initials = (user?.name || user?.email || 'U').charAt(0).toUpperCase();

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
