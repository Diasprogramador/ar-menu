import { useState } from 'react';

import { deleteAddon, listAddons, saveAddon, type AddonInput } from '../adminService';
import { Button, EmptyState, ErrorState, Field, Input, Panel, Skeleton, Switch } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { formatMoney } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import type { ProductAddon } from '@/types/database';

const EMPTY: AddonInput = {
  group_name: 'Adicionais',
  name: '',
  price_cents: 0,
  is_required: false,
  max_select: 1,
  sort_order: 0,
  is_active: true,
};

/**
 * Adicionais do produto.
 *
 * Agrupados por `group_name` porque é assim que aparecem para o cliente: "Ponto
 * da carne" e "Adicionais" são perguntas diferentes, com regras diferentes de
 * obrigatoriedade e limite de escolha.
 */
export function AddonsEditor({ restaurantId, productId }: { restaurantId: string; productId: string }) {
  const addons = useResource(() => listAddons(productId), [productId]);
  const [editing, setEditing] = useState<{ id?: string; values: AddonInput } | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!editing) return;
    if (!editing.values.name.trim()) {
      toast('Dê um nome ao adicional.', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveAddon(restaurantId, productId, editing.values, editing.id);
      setEditing(null);
      addons.reload();
      toast('Adicional salvo', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (addon: ProductAddon) => {
    if (!window.confirm(`Excluir "${addon.name}"?`)) return;
    try {
      await deleteAddon(addon.id);
      addons.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível excluir.', 'error');
    }
  };

  if (addons.status === 'loading' && !addons.data) {
    return <Skeleton className="h-48 w-full rounded-[10px]" />;
  }
  if (addons.status === 'error' && !addons.data) {
    return <ErrorState message={addons.error} onRetry={addons.reload} />;
  }

  const groups = groupBy(addons.data ?? []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {groups.length === 0 && !editing && (
        <Panel>
          <EmptyState
            title="Nenhum adicional"
            description="Adicionais deixam o cliente montar o prato e elevam o ticket médio."
            action={<Button variant="teal" onClick={() => setEditing({ values: EMPTY })}>Criar adicional</Button>}
          />
        </Panel>
      )}

      {groups.map(([groupName, items]) => (
        <Panel key={groupName} className="p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[15px] font-semibold">{groupName}</h3>
            <span className="text-[13px] text-muted">
              {items.some((addon) => addon.is_required) ? 'Obrigatório' : 'Opcional'} · até{' '}
              {Math.max(...items.map((addon) => addon.max_select))}
            </span>
          </div>

          <ul className="divide-y divide-hairline">
            {items.map((addon) => (
              <li key={addon.id} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 text-[14px]">{addon.name}</span>
                <span className="tabular text-[14px] text-muted">
                  + {formatMoney(addon.price_cents)}
                </span>
                {!addon.is_active && <span className="text-[12px] text-faint">inativo</span>}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing({
                      id: addon.id,
                      values: {
                        group_name: addon.group_name,
                        name: addon.name,
                        price_cents: addon.price_cents,
                        is_required: addon.is_required,
                        max_select: addon.max_select,
                        sort_order: addon.sort_order,
                        is_active: addon.is_active,
                      },
                    })
                  }
                >
                  Editar
                </Button>
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => void remove(addon)}>
                  Excluir
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ))}

      {editing ? (
        <Panel className="space-y-4 p-5">
          <h3 className="text-[15px] font-semibold">
            {editing.id ? 'Editar adicional' : 'Novo adicional'}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Grupo" hint="Ex.: Adicionais, Ponto da carne, Borda recheada.">
              {(id) => (
                <Input
                  id={id}
                  value={editing.values.group_name}
                  onChange={(event) =>
                    setEditing({ ...editing, values: { ...editing.values, group_name: event.target.value } })
                  }
                />
              )}
            </Field>

            <Field label="Nome" required>
              {(id) => (
                <Input
                  id={id}
                  value={editing.values.name}
                  onChange={(event) =>
                    setEditing({ ...editing, values: { ...editing.values, name: event.target.value } })
                  }
                  placeholder="Bacon extra"
                />
              )}
            </Field>

            <Field label="Preço adicional">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={(editing.values.price_cents / 100).toFixed(2)}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      values: {
                        ...editing.values,
                        price_cents: Math.round(Number(event.target.value || 0) * 100),
                      },
                    })
                  }
                />
              )}
            </Field>

            <Field label="Máximo de escolhas no grupo">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min="1"
                  max="20"
                  value={editing.values.max_select}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      values: { ...editing.values, max_select: Number(event.target.value) || 1 },
                    })
                  }
                />
              )}
            </Field>
          </div>

          <Switch
            checked={editing.values.is_required}
            onChange={(value) =>
              setEditing({ ...editing, values: { ...editing.values, is_required: value } })
            }
            label="Escolha obrigatória"
            description="O cliente não consegue adicionar o prato sem escolher uma opção do grupo."
          />

          <div className="flex gap-2">
            <Button variant="teal" loading={saving} onClick={() => void submit()}>
              Salvar
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </Panel>
      ) : (
        groups.length > 0 && (
          <Button variant="outline" onClick={() => setEditing({ values: EMPTY })}>
            Adicionar opção
          </Button>
        )
      )}
    </div>
  );
}

function groupBy(addons: ProductAddon[]): [string, ProductAddon[]][] {
  const groups = new Map<string, ProductAddon[]>();
  for (const addon of addons) {
    const list = groups.get(addon.group_name) ?? [];
    list.push(addon);
    groups.set(addon.group_name, list);
  }
  return [...groups.entries()];
}
