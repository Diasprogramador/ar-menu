import { useState } from 'react';

import { deleteCategory, listCategories, saveCategory, type CategoryInput } from '../adminService';
import { DataTable, PageHeader, Td } from '../components/AdminPrimitives';
import { useAuth } from '@/features/auth/AuthProvider';
import { Badge, Button, ErrorState, Field, Input, Sheet, Skeleton, Switch, Textarea } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { slugify } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import { useSeo } from '@/lib/seo';

const EMPTY: CategoryInput = {
  name: '',
  slug: '',
  description: null,
  sort_order: 0,
  is_active: true,
};

export default function CategoriesPage() {
  const { activeRestaurant } = useAuth();
  const [editing, setEditing] = useState<{ id?: string; values: CategoryInput } | null>(null);
  const [saving, setSaving] = useState(false);

  useSeo({ title: 'Categorias — AR Menu', noIndex: true });

  const categories = useResource(() => listCategories(activeRestaurant!.id), [activeRestaurant?.id]);

  const submit = async () => {
    if (!editing || !activeRestaurant) return;
    if (!editing.values.name.trim()) {
      toast('Dê um nome à categoria.', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveCategory(
        activeRestaurant.id,
        { ...editing.values, slug: editing.values.slug || slugify(editing.values.name) },
        editing.id,
      );
      setEditing(null);
      categories.reload();
      toast('Categoria salva', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Excluir "${name}"? Os produtos desta categoria continuam no cardápio, mas ficam sem categoria.`,
      )
    ) {
      return;
    }
    try {
      await deleteCategory(id);
      categories.reload();
      toast('Categoria excluída', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível excluir.', 'error');
    }
  };

  if (!activeRestaurant) return null;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Categorias"
        description="A ordem definida aqui é a ordem que o cliente vê no cardápio."
        actions={
          <Button variant="teal" onClick={() => setEditing({ values: EMPTY })}>
            Nova categoria
          </Button>
        }
      />

      {categories.status === 'loading' && !categories.data && <Skeleton className="h-48 w-full" />}
      {categories.status === 'error' && !categories.data && (
        <ErrorState message={categories.error} onRetry={categories.reload} />
      )}

      {categories.data && (
        <DataTable
          headers={['Ordem', 'Nome', 'Endereço', 'Status', '']}
          empty={categories.data.length === 0}
        >
          {categories.data.map((category) => (
            <tr key={category.id} className="hover:bg-surface/60">
              <Td className="tabular text-muted">{category.sort_order}</Td>
              <Td>
                <p className="font-medium">{category.name}</p>
                {category.description && (
                  <p className="text-[13px] text-muted">{category.description}</p>
                )}
              </Td>
              <Td className="font-mono text-[13px] text-muted">/{category.slug}</Td>
              <Td>
                {category.is_active ? <Badge tone="positive">Ativa</Badge> : <Badge>Oculta</Badge>}
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditing({
                        id: category.id,
                        values: {
                          name: category.name,
                          slug: category.slug,
                          description: category.description,
                          sort_order: category.sort_order,
                          is_active: category.is_active,
                        },
                      })
                    }
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => void remove(category.id, category.name)}
                  >
                    Excluir
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </DataTable>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar categoria' : 'Nova categoria'}
        footer={
          <div className="flex gap-2">
            <Button variant="teal" fullWidth loading={saving} onClick={() => void submit()}>
              Salvar
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Nome" required>
              {(id) => (
                <Input
                  id={id}
                  value={editing.values.name}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      values: {
                        ...editing.values,
                        name: event.target.value,
                        slug: editing.id ? editing.values.slug : slugify(event.target.value),
                      },
                    })
                  }
                  placeholder="Hambúrgueres"
                />
              )}
            </Field>

            <Field label="Endereço" hint={`/r/${activeRestaurant.slug}/categoria/${editing.values.slug || '...'}`}>
              {(id) => (
                <Input
                  id={id}
                  value={editing.values.slug}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      values: { ...editing.values, slug: slugify(event.target.value) },
                    })
                  }
                />
              )}
            </Field>

            <Field label="Descrição">
              {(id) => (
                <Textarea
                  id={id}
                  value={editing.values.description ?? ''}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      values: { ...editing.values, description: event.target.value },
                    })
                  }
                  placeholder="Blend 200 g, pão brioche, na chapa."
                />
              )}
            </Field>

            <Field label="Ordem no cardápio">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min="0"
                  value={editing.values.sort_order}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      values: { ...editing.values, sort_order: Number(event.target.value) || 0 },
                    })
                  }
                />
              )}
            </Field>

            <Switch
              checked={editing.values.is_active}
              onChange={(value) =>
                setEditing({ ...editing, values: { ...editing.values, is_active: value } })
              }
              label="Visível no cardápio"
            />
          </div>
        )}
      </Sheet>
    </div>
  );
}
