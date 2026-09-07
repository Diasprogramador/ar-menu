import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { AuthShell } from './AuthShell';
import { useAuth } from '../AuthProvider';
import { Button, Field, Input } from '@/components/ui';
import { useSeo } from '@/lib/seo';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useSeo({ title: 'Recuperar senha — AR Menu', noIndex: true });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível enviar o e-mail.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle={
        sent
          ? undefined
          : 'Informe o e-mail da conta e enviaremos um link para você definir uma senha nova.'
      }
      footer={
        <Link to="/admin/entrar" className="font-medium text-ink underline underline-offset-2">
          Voltar para o login
        </Link>
      }
    >
      {sent ? (
        // Resposta idêntica para e-mail existente ou não: informar qual dos dois
        // permitiria descobrir contas cadastradas.
        <p className="rounded-[8px] border border-hairline bg-surface p-4 text-[15px]">
          Se existir uma conta com <strong>{email}</strong>, o link de recuperação chega em instantes.
          Confira também a caixa de spam.
        </p>
      ) : (
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

          {error && (
            <p role="alert" className="rounded-[8px] bg-[#F9E7E5] p-3 text-[14px] text-danger">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" fullWidth loading={submitting}>
            Enviar link de recuperação
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
