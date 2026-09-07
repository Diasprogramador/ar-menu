import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { deleteProduct, listProducts, setProductAvailability } from '../adminService';
import { DataTable, PageHeader, Td } from '../components/AdminPrimitives';
import { useAuth } from '@/features/auth/AuthProvider';
import { Badge, Button, ButtonLink, ErrorState, Input, Select, Skeleton, SmartImage } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { formatMoney } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import { useSeo } from '@/lib/seo';

export default function ProductsPage() {
  const { activeRestaurant } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'ar' | 'no-ar' | 'unavailable'>('all');

  useSeo({ title: 'Produtos — AR Menu', noIndex: true });

  const products = useResource(() => listProducts(activeRestaurant!.id), [activeRestaurant?.id]);

  const visible = useMemo(() => {
    const items = products.data ?? [];
    const term = query.trim().toLowerCase();

    return items.filter((product) => {
      if (term && !product.name.toLowerCase().includes(term)) return false;
      if (filter === 'ar') return Boolean(product.product_models?.ar_enabled);
      if (filter === 'no-ar') return !product.product_models;
      if (filter === 'unavailable') return !product.is_available;
      return true;
    });
  }, [products.data, query, filter]);

  const toggleAvailability = async (productId: string, next: boolean) => {
    // Otimista: a linha responde na hora e só volta atrás se o banco recusar
    products.setData((current) =>
      current.map((product) =>
        product.id === productId ? { ...product, is_available: next } : product,
      ),
    );
    try {
      await setProductAvailability(productId, next);
    } catch (error) {
      products.reload();
      toast(error instanceof Error ? error.message : 'Não foi possível atualizar.', 'error');
    }
  };

  const remove = async (productId: string, name: string) => {
    if (!window.confirm(`Excluir "${name}"? Os pedidos antigos continuam com o registro da venda.`)) {
      return;
    }
    try {
      await deleteProduct(productId);
      products.reload();
      toast('Produto excluído', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível excluir.', 'error');
    }
  };

  if (!activeRestaurant) return null;

  const withAR = (products.data ?? []).filter((product) => product.product_models?.ar_enabled).length;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Produtos"
        description={
          products.data
            ? `${products.data.length} no cardápio · ${withAR} com realidade aumentada`
            : undefined
        }
        actions={
          <ButtonLink to="/admin/produtos/novo" variant="teal">
            Novo produto
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome"
          className="max-w-xs"
          type="search"
        />
        <Select
          value={filter}
          onChange={(event) => setFilter(event.target.value as typeof filter)}
          aria-label="Filtrar produtos"
          className="max-w-[200px]"
        >
          <option value="all">Todos</option>
          <option value="ar">Com AR ativa</option>
          <option value="no-ar">Sem modelo 3D</option>
          <option value="unavailable">Indisponíveis</option>
        </Select>
      </div>

      {products.status === 'loading' && !products.data && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      )}

      {products.status === 'error' && !products.data && (
        <ErrorState message={products.error} onRetry={products.reload} />
      )}

      {products.data && (
        <DataTable
          headers={['Produto', 'Categoria', 'Preço', 'AR', 'Disponível', '']}
          empty={visible.length === 0}
        >
          {visible.map((product) => (
            <tr key={product.id} className="hover:bg-surface/60">
              <Td>
                <div className="flex items-center gap-3">
                  <SmartImage
                    src={product.image_url}
                    alt=""
                    ratio="1/1"
                    className="size-10 shrink-0 rounded-[6px]"
                    fallbackLabel={product.name}
                  />
                  <Link
                    to={`/admin/produtos/${product.id}`}
                    className="font-medium hover:underline"
                  >
                    {product.name}
                  </Link>
                </div>
              </Td>
              <Td className="text-muted">{product.categories?.name ?? '—'}</Td>
              <Td className="tabular">
                {formatMoney(product.price_cents, activeRestaurant.currency)}
              </Td>
              <Td>
                {product.product_models?.ar_enabled ? (
                  <Badge tone="ember">Ativa</Badge>
                ) : product.product_models ? (
                  <Badge>Desligada</Badge>
                ) : (
                  <span className="text-[13px] text-faint">Sem modelo</span>
                )}
              </Td>
              <Td>
                <button
                  type="button"
                  role="switch"
                  aria-checked={product.is_available}
                  aria-label={`Disponibilidade de ${product.name}`}
                  onClick={() => void toggleAvailability(product.id, !product.is_available)}
                  className={
                    product.is_available
                      ? 'h-6 w-10 rounded-full bg-ink'
                      : 'h-6 w-10 rounded-full border border-hairline bg-surface'
                  }
                >
                  <span
                    className={
                      product.is_available
                        ? 'block size-4 translate-x-[19px] rounded-full bg-paper transition-transform'
                        : 'block size-4 translate-x-[3px] rounded-full bg-paper transition-transform'
                    }
                  />
                </button>
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/admin/produtos/${product.id}`)}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => void remove(product.id, product.name)}
                  >
                    Excluir
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
