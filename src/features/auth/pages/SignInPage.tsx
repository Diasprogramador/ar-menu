import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { AuthShell } from './AuthShell';
import { useAuth } from '../AuthProvider';
import { Button, Field, Input } from '@/components/ui';
import { useSeo } from '@/lib/seo';

export default function SignInPage() {
  const { signIn, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useSeo({ title: 'Entrar — AR Menu', noIndex: true });

  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/admin'} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate('/admin', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Entrar no painel"
      subtitle="Gerencie o cardápio, os modelos 3D e os pedidos do seu restaurante."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/admin/cadastro" className="font-medium text-ink underline underline-offset-2">
            Criar restaurante
          </Link>
        </>
      }
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
        <Field label="E-mail" required>
          {(id) => (
            <Input
              id={id}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              placeholder="voce@restaurante.com.br"
            />
          )}
        </Field>

        <Field label="Senha" required>
          {(id) => (
            <Input
              id={id}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          )}
        </Field>

        {error && (
          <p role="alert" className="rounded-[8px] bg-[#F9E7E5] p-3 text-[14px] text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Entrar
        </Button>

        <Link
          to="/admin/recuperar"
          className="block text-center text-[14px] text-muted underline underline-offset-2"
        >
          Esqueci minha senha
        </Link>
      </form>
    </AuthShell>
  );
}
