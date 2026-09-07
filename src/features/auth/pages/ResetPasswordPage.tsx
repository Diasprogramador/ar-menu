import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { AuthShell } from './AuthShell';
import { useAuth } from '../AuthProvider';
import { Button, Field, Input } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { useSeo } from '@/lib/seo';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Definição de nova senha.
 *
 * O Supabase troca o token do link por uma sessão temporária antes desta tela
 * montar (`detectSessionInUrl`), então basta chamar `updateUser`. Se a pessoa
 * abriu a URL sem token, `status` fica anônimo e explicamos o que houve.
 */
export default function ResetPasswordPage() {
  const { updatePassword, status } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useSeo({ title: 'Nova senha — AR Menu', noIndex: true });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setError('As duas senhas não conferem.');
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(password);
      toast('Senha atualizada', 'success');
      navigate('/admin', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível atualizar a senha.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'anonymous') {
    return (
      <AuthShell
        title="Link expirado"
        subtitle="Este link de recuperação não é mais válido. Peça um novo para continuar."
      >
        <Button size="lg" fullWidth onClick={() => navigate('/admin/recuperar')}>
          Pedir novo link
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Definir nova senha" subtitle="Escolha uma senha que você não use em outro lugar.">
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
        <Field label="Nova senha" required hint={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`}>
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

        <Field label="Confirme a nova senha" required>
          {(id) => (
            <Input
              id={id}
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              required
            />
          )}
        </Field>

        {error && (
          <p role="alert" className="rounded-[8px] bg-[#F9E7E5] p-3 text-[14px] text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Salvar nova senha
        </Button>
      </form>
    </AuthShell>
  );
}
