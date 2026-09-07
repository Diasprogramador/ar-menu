import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AuthShell } from './AuthShell';
import { useAuth } from '../AuthProvider';
import { Button, Field, Input } from '@/components/ui';
import { useSeo } from '@/lib/seo';

const MIN_PASSWORD_LENGTH = 8;

export default function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useSeo({ title: 'Criar conta — AR Menu', noIndex: true });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    setSubmitting(true);
    try {
      const { needsConfirmation } = await signUp({ email, password, fullName });
      if (needsConfirmation) {
        setConfirmationSent(true);
        return;
      }
      // Conta criada e já autenticada: segue direto para cadastrar o restaurante
      navigate('/admin/primeiro-acesso', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível criar a conta.');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmationSent) {
    return (
      <AuthShell
        title="Confirme seu e-mail"
        subtitle={`Enviamos um link de confirmação para ${email}. Abra o e-mail para ativar a conta.`}
      >
        <Link
          to="/admin/entrar"
          className="flex h-12 items-center justify-center rounded-[8px] border border-hairline text-[15px] font-medium"
        >
          Voltar para o login
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Criar seu restaurante"
      subtitle="14 dias para testar. Sem cartão de crédito."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/admin/entrar" className="font-medium text-ink underline underline-offset-2">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
        <Field label="Seu nome" required>
          {(id) => (
            <Input
              id={id}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
              placeholder="Maria Souza"
            />
          )}
        </Field>

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

        <Field label="Senha" required hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`}>
          {(id) => (
            <Input
              id={id}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
            />
          )}
        </Field>

        {error && (
          <p role="alert" className="rounded-[8px] bg-[#F9E7E5] p-3 text-[14px] text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Criar conta
        </Button>
      </form>
    </AuthShell>
  );
}
