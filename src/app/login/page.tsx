import AuthForm from '@/components/AuthForm';

export default function LoginPage() {
  return (
    <AuthForm
      accent="blue"
      redirectTo="/dashboard"
      title="Manager Sign In"
      subtitle="Access your wealth management dashboard"
    />
  );
}
