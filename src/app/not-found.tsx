import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="auth-page">
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 80, fontWeight: 900, color: 'var(--text-muted)', lineHeight: 1 }}>404</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 16 }}>Page not found</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>The page you're looking for doesn't exist.</p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 24, display: 'inline-flex' }}>Go home</Link>
      </div>
    </div>
  );
}
