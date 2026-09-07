import { useEffect, useRef, useState } from 'react';

import {
  getSubscription,
  updateRestaurant,
  uploadFile,
  type RestaurantSettingsInput,
} from '../adminService';
import { PageHeader, PanelSection } from '../components/AdminPrimitives';
import { useAuth } from '@/features/auth/AuthProvider';
import { Badge, Button, ErrorState, Field, Input, Panel, Select, Skeleton, SmartImage, Textarea } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { buildTargetUrl } from '@/features/qrcodes/qrService';
import { formatMoney } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import { useSeo } from '@/lib/seo';
import type { OpeningHours, WeekdayKey } from '@/types/database';

const WEEKDAYS: { key: WeekdayKey; label: string }[] = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

export default function SettingsPage() {
  const { activeRestaurant, role, profile, updateProfile, refresh } = useAuth();
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<RestaurantSettingsInput>({});
  const [hours, setHours] = useState<OpeningHours>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fullName, setFullName] = useState('');

  useSeo({ title: 'Configurações — AR Menu', noIndex: true });

  const subscription = useResource(
    () => getSubscription(activeRestaurant!.id),
    [activeRestaurant?.id],
  );

  useEffect(() => {
    if (!activeRestaurant) return;
    setForm({
      name: activeRestaurant.name,
      description: activeRestaurant.description,
      address: activeRestaurant.address,
      phone: activeRestaurant.phone,
      whatsapp: activeRestaurant.whatsapp,
      instagram: activeRestaurant.instagram,
      cover_url: activeRestaurant.cover_url,
      accent_color: activeRestaurant.accent_color,
      is_open_override: activeRestaurant.is_open_override,
      closed_message: activeRestaurant.closed_message,
    });
    setHours(activeRestaurant.opening_hours);
  }, [activeRestaurant]);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
  }, [profile]);

  const canEdit = role === 'owner' || role === 'admin';

  const save = async () => {
    if (!activeRestaurant) return;
    setSaving(true);
    try {
      await updateRestaurant(activeRestaurant.id, { ...form, opening_hours: hours });
      await refresh();
      toast('Configurações salvas', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const uploadCover = async (file: File) => {
    if (!activeRestaurant) return;
    setUploading(true);
    try {
      const url = await uploadFile({
        bucket: 'restaurant-branding',
        restaurantId: activeRestaurant.id,
        path: 'branding/cover',
        file,
      });
      setForm((current) => ({ ...current, cover_url: `${url}?v=${Date.now()}` }));
      toast('Capa enviada — salve para publicar', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível enviar a capa.', 'error');
    } finally {
      setUploading(false);
    }
  };

  if (!activeRestaurant) return null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <PageHeader
        title="Configurações"
        description={buildTargetUrl(`/r/${activeRestaurant.slug}`)}
        actions={
          canEdit && (
            <Button variant="teal" loading={saving} onClick={() => void save()}>
              Salvar alterações
            </Button>
          )
        }
      />

      {!canEdit && (
        <Panel className="p-4 text-[14px] text-muted">
          Seu perfil é de equipe: você pode ver as configurações, mas alterações ficam com o
          proprietário ou administrador.
        </Panel>
      )}

      <PanelSection title="Identidade do restaurante">
        <div className="space-y-4">
          <Field label="Nome">
            {(id) => (
              <Input
                id={id}
                value={form.name ?? ''}
                disabled={!canEdit}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            )}
          </Field>

          <Field label="Descrição" hint="Aparece embaixo do nome no cardápio e no compartilhamento.">
            {(id) => (
              <Textarea
                id={id}
                value={form.description ?? ''}
                disabled={!canEdit}
                maxLength={280}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            )}
          </Field>

          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-soft">Foto de capa</p>
            <SmartImage
              src={form.cover_url}
              alt=""
              ratio="16/9"
              className="max-w-md rounded-[8px]"
              fallbackLabel={form.name ?? 'Capa'}
            />
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadCover(file);
                event.target.value = '';
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={!canEdit}
              loading={uploading}
              onClick={() => coverInputRef.current?.click()}
            >
              Trocar capa
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Endereço">
              {(id) => (
                <Input
                  id={id}
                  value={form.address ?? ''}
                  disabled={!canEdit}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
              )}
            </Field>
            <Field label="Telefone">
              {(id) => (
                <Input
                  id={id}
                  value={form.phone ?? ''}
                  disabled={!canEdit}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              )}
            </Field>
            <Field label="WhatsApp" hint="Só números, com DDI. Ex.: 5511999999999">
              {(id) => (
                <Input
                  id={id}
                  value={form.whatsapp ?? ''}
                  disabled={!canEdit}
                  onChange={(event) => setForm({ ...form, whatsapp: event.target.value })}
                />
              )}
            </Field>
            <Field label="Instagram" hint="Só o usuário, sem @.">
              {(id) => (
                <Input
                  id={id}
                  value={form.instagram ?? ''}
                  disabled={!canEdit}
                  onChange={(event) => setForm({ ...form, instagram: event.target.value })}
                />
              )}
            </Field>
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Horário de funcionamento">
        <p className="mb-3 text-[13px] text-muted">
          Deixe vazio para marcar o dia como fechado. Faixas que viram a madrugada funcionam:
          18:00 às 01:00.
        </p>

        <div className="space-y-2">
          {WEEKDAYS.map((day) => {
            const range = hours[day.key]?.[0];
            return (
              <div key={day.key} className="flex items-center gap-3">
                <span className="w-20 text-[14px]">{day.label}</span>
                <Input
                  type="time"
                  aria-label={`Abertura de ${day.label}`}
                  disabled={!canEdit}
                  value={range?.[0] ?? ''}
                  onChange={(event) => setHours(setRange(hours, day.key, 0, event.target.value))}
                  className="max-w-[130px]"
                />
                <span className="text-muted">às</span>
                <Input
                  type="time"
                  aria-label={`Fechamento de ${day.label}`}
                  disabled={!canEdit}
                  value={range?.[1] ?? ''}
                  onChange={(event) => setHours(setRange(hours, day.key, 1, event.target.value))}
                  className="max-w-[130px]"
                />
                {range && canEdit && (
                  <button
                    type="button"
                    onClick={() => setHours({ ...hours, [day.key]: [] })}
                    className="text-[13px] text-muted underline underline-offset-2"
                  >
                    Fechado
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 space-y-3 border-t border-hairline pt-4">
          <Field label="Abertura manual">
            {(id) => (
              <Select
                id={id}
                value={form.is_open_override === null || form.is_open_override === undefined ? 'auto' : String(form.is_open_override)}
                disabled={!canEdit}
                onChange={(event) =>
                  setForm({
                    ...form,
                    is_open_override:
                      event.target.value === 'auto' ? null : event.target.value === 'true',
                  })
                }
                className="max-w-xs"
              >
                <option value="auto">Seguir o horário acima</option>
                <option value="true">Forçar aberto</option>
                <option value="false">Forçar fechado</option>
              </Select>
            )}
          </Field>

          <Field label="Aviso quando fechado">
            {(id) => (
              <Input
                id={id}
                value={form.closed_message ?? ''}
                disabled={!canEdit}
                placeholder="Hoje estamos fechados. Confira o cardápio enquanto isso."
                onChange={(event) => setForm({ ...form, closed_message: event.target.value })}
              />
            )}
          </Field>
        </div>
      </PanelSection>

      <PanelSection title="Sua conta">
        <div className="space-y-4">
          <Field label="Seu nome">
            {(id) => (
              <Input id={id} value={fullName} onChange={(event) => setFullName(event.target.value)} />
            )}
          </Field>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await updateProfile({ full_name: fullName });
                toast('Perfil atualizado', 'success');
              } catch (error) {
                toast(error instanceof Error ? error.message : 'Não foi possível salvar.', 'error');
              }
            }}
          >
            Salvar perfil
          </Button>
        </div>
      </PanelSection>

      <PanelSection title="Plano">
        {subscription.status === 'loading' && !subscription.data && <Skeleton className="h-20 w-full" />}
        {subscription.status === 'error' && (
          <ErrorState message={subscription.error ?? ''} onRetry={subscription.reload} />
        )}
        {subscription.data?.plan && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1">
              <p className="font-display text-[20px]">{subscription.data.plan.name}</p>
              <p className="mt-0.5 text-[14px] text-muted">
                {formatMoney(subscription.data.plan.price_cents)} por mês
                {subscription.data.current_period_end &&
                  ` · renova em ${new Date(subscription.data.current_period_end).toLocaleDateString('pt-BR')}`}
              </p>
            </div>
            <Badge tone={subscription.data.status === 'active' ? 'positive' : 'warning'}>
              {subscription.data.status === 'active'
                ? 'Ativo'
                : subscription.data.status === 'trialing'
                  ? 'Em teste'
                  : subscription.data.status}
            </Badge>
          </div>
        )}
        {subscription.data?.plan?.entitlements.ar === false && (
          <p className="mt-3 rounded-[6px] bg-ember-wash p-3 text-[14px] text-ember-deep">
            A realidade aumentada faz parte do plano Pro. Fale com a gente para liberar os modelos 3D
            no seu cardápio.
          </p>
        )}
      </PanelSection>
    </div>
  );
}

/** Atualiza um dos lados da faixa de horário mantendo o outro intacto. */
function setRange(hours: OpeningHours, day: WeekdayKey, index: 0 | 1, value: string): OpeningHours {
  const current = hours[day]?.[0] ?? ['', ''];
  const next: [string, string] = index === 0 ? [value, current[1]] : [current[0], value];
  return { ...hours, [day]: next[0] && next[1] ? [next] : next[0] || next[1] ? [next] : [] };
}
