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

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-name">Aurum Wealth</div>
        <div className="brand-tagline">Wealth Management</div>
      </div>

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

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">
            {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div className="user-name">{user?.name || user?.email}</div>
            <div className="user-role">{user?.role?.toUpperCase()}</div>
          </div>
        </div>
        <button className="nav-item" style={{ width: '100%', background: 'none', border: 'none' }} onClick={handleSignOut}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
