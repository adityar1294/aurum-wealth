import AuthForm from '@/components/AuthForm';

export default function PortalLoginPage() {
  return (
    <AuthForm
      accent="green"
      redirectTo="/portal"
      title="Client Portal"
      subtitle="View your portfolio and investments"
    />
  );
}
