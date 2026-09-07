import { useState } from 'react';

import { deleteTable, listTables, saveTable, type TableInput } from '../adminService';
import { DataTable, PageHeader, Td } from '../components/AdminPrimitives';
import { useAuth } from '@/features/auth/AuthProvider';
import { Badge, Button, ErrorState, Field, Input, Select, Sheet, Skeleton } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { useResource } from '@/lib/useResource';
import { useSeo } from '@/lib/seo';
import type { TableStatus } from '@/types/database';

const EMPTY: TableInput = {
  code: '',
  label: null,
  seats: 4,
  location: null,
  status: 'available',
};

const STATUS_LABEL: Record<TableStatus, string> = {
  available: 'Livre',
  occupied: 'Ocupada',
  reserved: 'Reservada',
  inactive: 'Desativada',
};

export default function TablesPage() {
  const { activeRestaurant } = useAuth();
  const [editing, setEditing] = useState<{ id?: string; values: TableInput } | null>(null);
  const [saving, setSaving] = useState(false);

  useSeo({ title: 'Mesas — AR Menu', noIndex: true });

  const tables = useResource(() => listTables(activeRestaurant!.id), [activeRestaurant?.id]);

  const submit = async () => {
    if (!editing || !activeRestaurant) return;
    if (!/^[A-Za-z0-9-]{1,16}$/.test(editing.values.code)) {
      toast('O código da mesa aceita letras, números e hífen, até 16 caracteres.', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveTable(activeRestaurant.id, editing.values, editing.id);
      setEditing(null);
      tables.reload();
      toast('Mesa salva', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, code: string) => {
    if (!window.confirm(`Excluir a mesa ${code}? O QR Code dela deixa de funcionar.`)) return;
    try {
      await deleteTable(id);
      tables.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível excluir.', 'error');
    }
  };

  if (!activeRestaurant) return null;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Mesas"
        description="Cada mesa ganha um QR Code próprio, e o pedido chega à cozinha já identificado."
        actions={
          <Button variant="teal" onClick={() => setEditing({ values: EMPTY })}>
            Nova mesa
          </Button>
        }
      />

      {tables.status === 'loading' && !tables.data && <Skeleton className="h-48 w-full" />}
      {tables.status === 'error' && !tables.data && (
        <ErrorState message={tables.error} onRetry={tables.reload} />
      )}

      {tables.data && (
        <DataTable
          headers={['Código', 'Nome', 'Lugares', 'Local', 'Status', '']}
          empty={tables.data.length === 0}
        >
          {tables.data.map((table) => (
            <tr key={table.id} className="hover:bg-surface/60">
              <Td className="tabular font-mono font-semibold">{table.code}</Td>
              <Td>{table.label ?? '—'}</Td>
              <Td className="tabular text-muted">{table.seats ?? '—'}</Td>
              <Td className="text-muted">{table.location ?? '—'}</Td>
              <Td>
                <Badge
                  tone={
                    table.status === 'available'
                      ? 'positive'
                      : table.status === 'occupied'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {STATUS_LABEL[table.status]}
                </Badge>
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditing({
                        id: table.id,
                        values: {
                          code: table.code,
                          label: table.label,
                          seats: table.seats,
                          location: table.location,
                          status: table.status,
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
                    onClick={() => void remove(table.id, table.code)}
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
        title={editing?.id ? 'Editar mesa' : 'Nova mesa'}
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
            <Field label="Código" required hint="Aparece no QR Code e no pedido. Ex.: 01, VIP-2.">
              {(id) => (
                <Input
                  id={id}
                  value={editing.values.code}
                  onChange={(event) =>
                    setEditing({ ...editing, values: { ...editing.values, code: event.target.value } })
                  }
                  maxLength={16}
                  placeholder="01"
                />
              )}
            </Field>

            <Field label="Nome">
              {(id) => (
                <Input
                  id={id}
                  value={editing.values.label ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, values: { ...editing.values, label: event.target.value } })
                  }
                  placeholder="Mesa 01"
                />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Lugares">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min="1"
                    max="40"
                    value={editing.values.seats ?? ''}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        values: {
                          ...editing.values,
                          seats: event.target.value ? Number(event.target.value) : null,
                        },
                      })
                    }
                  />
                )}
              </Field>

              <Field label="Status">
                {(id) => (
                  <Select
                    id={id}
                    value={editing.values.status}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        values: { ...editing.values, status: event.target.value as TableStatus },
                      })
                    }
                  >
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            <Field label="Local" hint="Salão, varanda, mezanino…">
              {(id) => (
                <Input
                  id={id}
                  value={editing.values.location ?? ''}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      values: { ...editing.values, location: event.target.value },
                    })
                  }
                />
              )}
            </Field>
          </div>
        )}
      </Sheet>
    </div>
  );
}
