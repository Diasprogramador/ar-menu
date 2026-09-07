import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { createRestaurant } from '../adminService';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { env } from '@/lib/env';
import { slugify } from '@/lib/format';
import { useSeo } from '@/lib/seo';

/**
 * Primeiro acesso: criação do restaurante.
 *
 * Passa pela RPC `create_restaurant`, que numa transação só cria o restaurante,
 * torna quem chamou o `owner`, assina o plano de entrada e gera o QR Code geral.
 * Fazer isso em quatro chamadas do cliente deixaria restaurante órfão se uma
 * delas falhasse no meio.
 */
export default function OnboardingPage() {
  const { memberships, refresh, switchRestaurant } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useSeo({ title: 'Criar restaurante — AR Menu', noIndex: true });

  if (memberships.length > 0) return <Navigate to="/admin" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    const finalSlug = slug || slugify(name);
    if (finalSlug.length < 2) {
      setError('O endereço precisa de pelo menos dois caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      const restaurant = await createRestaurant({ name, slug: finalSlug, description });
      await refresh();
      switchRestaurant(restaurant.id);
      toast('Restaurante criado', 'success');
      navigate('/admin', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message.includes('já existe')
          ? 'Esse endereço já está em uso. Escolha outro.'
          : caught instanceof Error
            ? caught.message
            : 'Não foi possível criar o restaurante.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const previewUrl = `${env.appUrl}/r/${slug || slugify(name) || 'seu-restaurante'}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-12">
      <div className="h-px w-12 ember-rule" />
      <h1 className="mt-5 font-display text-[34px] leading-tight">Vamos criar seu restaurante</h1>
      <p className="mt-2 text-[15px] text-muted">
        Depois disso você cadastra as categorias, os pratos e os modelos 3D.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-8 space-y-4" noValidate>
        <Field label="Nome do restaurante" required>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!slugTouched) setSlug(slugify(event.target.value));
              }}
              placeholder="Brasa & Mesa"
              required
              maxLength={80}
            />
          )}
        </Field>

        <Field label="Endereço do cardápio" required hint={previewUrl}>
          {(id) => (
            <Input
              id={id}
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(slugify(event.target.value));
              }}
              placeholder="brasa-e-mesa"
              required
            />
          )}
        </Field>

        <Field label="Descrição curta">
          {(id) => (
            <Textarea
              id={id}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Hambúrgueres na brasa e pizzas de forno a lenha na Vila Madalena."
              maxLength={280}
            />
          )}
        </Field>

        {error && (
          <p role="alert" className="rounded-[8px] bg-[#F9E7E5] p-3 text-[14px] text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Criar restaurante
        </Button>
      </form>
    </main>
  );
}
