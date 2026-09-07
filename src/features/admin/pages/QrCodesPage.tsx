import { useEffect, useMemo, useState } from 'react';

import { createQrCode, deleteQrCode, listProducts, listQrCodes, listTables } from '../adminService';
import { PageHeader } from '../components/AdminPrimitives';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  buildTargetUrl,
  downloadDataUrl,
  downloadSvg,
  generateQrDataUrl,
  generateQrSvg,
  printQrSheet,
} from '@/features/qrcodes/qrService';
import { Badge, Button, EmptyState, ErrorState, Panel, Select, Skeleton } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { slugify } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import { useSeo } from '@/lib/seo';
import type { QrCode, QrCodeType } from '@/types/database';

const TYPE_LABEL: Record<QrCodeType, string> = {
  general: 'Cardápio geral',
  table: 'Mesa',
  product: 'Produto',
};

/**
 * QR Codes do restaurante.
 *
 * Três alcances diferentes, cada um com um uso concreto: o geral vai na porta e
 * no balcão, o de mesa carrega o contexto do pedido, e o de produto serve para
 * material impresso — um flyer que leva direto ao prato em AR.
 */
export default function QrCodesPage() {
  const { activeRestaurant } = useAuth();
  const [creating, setCreating] = useState(false);

  useSeo({ title: 'QR Codes — AR Menu', noIndex: true });

  const codes = useResource(() => listQrCodes(activeRestaurant!.id), [activeRestaurant?.id]);
  const tables = useResource(() => listTables(activeRestaurant!.id), [activeRestaurant?.id]);
  const products = useResource(() => listProducts(activeRestaurant!.id), [activeRestaurant?.id]);

  const grouped = useMemo(() => {
    const list = codes.data ?? [];
    return {
      general: list.filter((code) => code.type === 'general'),
      table: list.filter((code) => code.type === 'table'),
      product: list.filter((code) => code.type === 'product'),
    };
  }, [codes.data]);

  /** Mesas sem QR Code: o caso mais comum de esquecimento na operação. */
  const missingTables = useMemo(() => {
    const covered = new Set((codes.data ?? []).map((code) => code.table_id).filter(Boolean));
    return (tables.data ?? []).filter((table) => !covered.has(table.id));
  }, [codes.data, tables.data]);

  const generateForMissing = async () => {
    if (!activeRestaurant) return;
    setCreating(true);
    try {
      for (const table of missingTables) {
        await createQrCode(activeRestaurant.id, {
          type: 'table',
          label: `Mesa ${table.code}`,
          target_path: `/r/${activeRestaurant.slug}/mesa/${table.code}`,
          table_id: table.id,
        });
      }
      codes.reload();
      toast(`${missingTables.length} QR Codes criados`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível criar.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const addProductCode = async (productId: string) => {
    if (!activeRestaurant) return;
    const product = (products.data ?? []).find((item) => item.id === productId);
    if (!product) return;

    try {
      await createQrCode(activeRestaurant.id, {
        type: 'product',
        label: product.name,
        target_path: `/r/${activeRestaurant.slug}/produto/${product.slug}`,
        product_id: product.id,
      });
      codes.reload();
      toast('QR Code criado', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível criar.', 'error');
    }
  };

  const remove = async (code: QrCode) => {
    if (!window.confirm(`Excluir o QR Code "${code.label}"? Os adesivos impressos param de funcionar.`)) {
      return;
    }
    try {
      await deleteQrCode(code.id);
      codes.reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível excluir.', 'error');
    }
  };

  const printAll = async () => {
    if (!activeRestaurant || !codes.data) return;
    try {
      await printQrSheet(
        activeRestaurant.name,
        codes.data.map((code) => ({ label: code.label, path: code.target_path })),
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível abrir a impressão.', 'error');
    }
  };

  if (!activeRestaurant) return null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="QR Codes"
        description="Imprima, cole na mesa e o cliente entra direto no cardápio."
        actions={
          <Button variant="outline" onClick={() => void printAll()} disabled={!codes.data?.length}>
            Imprimir folha
          </Button>
        }
      />

      {codes.status === 'loading' && !codes.data && <Skeleton className="h-64 w-full rounded-[10px]" />}
      {codes.status === 'error' && !codes.data && (
        <ErrorState message={codes.error} onRetry={codes.reload} />
      )}

      {codes.data && (
        <div className="space-y-6">
          {missingTables.length > 0 && (
            <Panel className="flex flex-wrap items-center gap-3 border-warning/30 bg-[#FBF0DE] p-4">
              <p className="flex-1 text-[14px]">
                {missingTables.length} {missingTables.length === 1 ? 'mesa está' : 'mesas estão'} sem
                QR Code.
              </p>
              <Button size="sm" variant="teal" loading={creating} onClick={() => void generateForMissing()}>
                Gerar agora
              </Button>
            </Panel>
          )}

          <Section
            title="Cardápio geral"
            description="Para a porta, o balcão e as redes sociais."
            codes={grouped.general}
            onRemove={remove}
          />

          <Section
            title="Por mesa"
            description="O pedido chega à cozinha já com a mesa identificada."
            codes={grouped.table}
            onRemove={remove}
          />

          <Section
            title="Por produto"
            description="Leva direto ao prato, com a realidade aumentada a um toque."
            codes={grouped.product}
            onRemove={remove}
            footer={
              <div className="flex max-w-sm items-center gap-2">
                <Select
                  aria-label="Criar QR Code de produto"
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value) void addProductCode(event.target.value);
                    event.target.value = '';
                  }}
                >
                  <option value="">Criar QR Code de um produto…</option>
                  {(products.data ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </Select>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  codes,
  onRemove,
  footer,
}: {
  title: string;
  description: string;
  codes: QrCode[];
  onRemove: (code: QrCode) => void;
  footer?: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-[20px]">{title}</h2>
      <p className="mt-0.5 text-[14px] text-muted">{description}</p>

      {codes.length === 0 ? (
        <Panel className="mt-3">
          <EmptyState title="Nenhum QR Code aqui" description="Crie um quando precisar." />
        </Panel>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {codes.map((code) => (
            <QrCard key={code.id} code={code} onRemove={() => onRemove(code)} />
          ))}
        </div>
      )}

      {footer && <div className="mt-3">{footer}</div>}
    </section>
  );
}

function QrCard({ code, onRemove }: { code: QrCode; onRemove: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    generateQrDataUrl(code.target_path, 420)
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [code.target_path]);

  const filename = `qr-${slugify(code.label)}`;

  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{code.label}</p>
          <p className="truncate font-mono text-[12px] text-faint">{buildTargetUrl(code.target_path)}</p>
        </div>
        <Badge tone={code.type === 'product' ? 'ember' : 'neutral'}>{TYPE_LABEL[code.type]}</Badge>
      </div>

      <div className="mt-3 flex aspect-square items-center justify-center rounded-[8px] bg-white p-3">
        {dataUrl ? (
          <img src={dataUrl} alt={`QR Code de ${code.label}`} className="size-full object-contain" />
        ) : failed ? (
          <p className="text-[13px] text-danger">Não foi possível gerar o código.</p>
        ) : (
          <Skeleton className="size-full" />
        )}
      </div>

      <p className="tabular mt-2 text-[12px] text-muted">
        {code.scan_count} {code.scan_count === 1 ? 'leitura' : 'leituras'}
      </p>

      <div className="mt-3 flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={!dataUrl}
          onClick={() => dataUrl && downloadDataUrl(dataUrl, `${filename}.png`)}
        >
          PNG
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              downloadSvg(await generateQrSvg(code.target_path), `${filename}.svg`);
            } catch {
              toast('Não foi possível gerar o SVG.', 'error');
            }
          }}
        >
          SVG
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto text-danger" onClick={onRemove}>
          Excluir
        </Button>
      </div>
    </Panel>
  );
}
