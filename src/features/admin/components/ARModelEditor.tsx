import { lazy, Suspense, useMemo, useRef, useState } from 'react';

import { STORAGE_LIMITS, uploadFile, type ProductModelInput } from '../adminService';
import { Button, Field, Input, Panel, Switch } from '@/components/ui';
import { toast } from '@/components/ToastHost';
import { validateDimensions, type ScaleCalibration } from '@/features/ar/scale';
import { cn } from '@/lib/cn';
import { formatDimensions } from '@/lib/format';
import type { ProductModel } from '@/types/database';

const ModelViewer3D = lazy(() =>
  import('@/features/models3d/ModelViewer3D').then((module) => ({ default: module.ModelViewer3D })),
);

/**
 * Configuração de 3D e realidade aumentada de um produto.
 *
 * A ordem das etapas na tela é a ordem em que o restaurante consegue executá-las:
 * enviar o arquivo, medir o prato de verdade com uma régua, conferir no preview
 * e só então ligar a AR para os clientes.
 *
 * O preview não é enfeite — é a única forma de o restaurante perceber que o
 * modelo veio em centímetros, ou de cabeça para baixo, antes que o cliente veja.
 */
export function ARModelEditor({
  restaurantId,
  productId,
  productName,
  model,
  onSave,
  onRemove,
}: {
  restaurantId: string;
  productId: string;
  productName: string;
  model: ProductModel | null;
  onSave: (input: ProductModelInput) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const modelInputRef = useRef<HTMLInputElement>(null);
  const usdzInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ProductModelInput>(() => ({
    model_url: model?.model_url ?? '',
    usdz_url: model?.usdz_url ?? null,
    format: model?.format ?? 'glb',
    ar_enabled: model?.ar_enabled ?? true,
    width_cm: model?.width_cm ?? null,
    height_cm: model?.height_cm ?? null,
    depth_cm: model?.depth_cm ?? null,
    diameter_cm: model?.diameter_cm ?? null,
    scale_multiplier: model?.scale_multiplier ?? 1,
    rotation_x_deg: model?.rotation_x_deg ?? 0,
    rotation_y_deg: model?.rotation_y_deg ?? 0,
    rotation_z_deg: model?.rotation_z_deg ?? 0,
    offset_x_cm: model?.offset_x_cm ?? 0,
    offset_y_cm: model?.offset_y_cm ?? 0,
    offset_z_cm: model?.offset_z_cm ?? 0,
    file_size_bytes: model?.file_size_bytes ?? null,
  }));

  const [shape, setShape] = useState<'box' | 'round'>(model?.diameter_cm ? 'round' : 'box');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calibration, setCalibration] = useState<ScaleCalibration | null>(null);

  const update = <K extends keyof ProductModelInput>(key: K, value: ProductModelInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const problems = useMemo(
    () =>
      validateDimensions({
        width_cm: form.width_cm,
        height_cm: form.height_cm,
        depth_cm: form.depth_cm,
        diameter_cm: form.diameter_cm,
      }),
    [form.width_cm, form.height_cm, form.depth_cm, form.diameter_cm],
  );

  const dimensions = useMemo(
    () => ({
      width_cm: form.width_cm,
      height_cm: form.height_cm,
      depth_cm: form.depth_cm,
      diameter_cm: form.diameter_cm,
    }),
    [form.width_cm, form.height_cm, form.depth_cm, form.diameter_cm],
  );

  const placement = useMemo(
    () => ({
      scaleMultiplier: form.scale_multiplier,
      rotation: { x: form.rotation_x_deg, y: form.rotation_y_deg, z: form.rotation_z_deg },
      offsetCm: { x: form.offset_x_cm, y: form.offset_y_cm, z: form.offset_z_cm },
    }),
    [form],
  );

  const upload = async (file: File, kind: 'model' | 'usdz') => {
    setUploading(true);
    try {
      const url = await uploadFile({
        bucket: 'product-models',
        restaurantId,
        path: `products/${productId}/${kind === 'usdz' ? 'model-ios' : 'model'}`,
        file,
      });
      const versioned = `${url}?v=${Date.now()}`;

      if (kind === 'usdz') {
        update('usdz_url', versioned);
      } else {
        update('model_url', versioned);
        update('format', file.name.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb');
        update('file_size_bytes', file.size);
      }
      toast('Arquivo enviado', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.model_url) {
      toast('Envie o modelo 3D antes de salvar.', 'error');
      return;
    }
    if (problems.length > 0) {
      toast(problems[0]!, 'error');
      return;
    }

    setSaving(true);
    try {
      // O formato escolhido decide quais campos são gravados: manter os dois
      // preenchidos faria o cálculo de escala usar o eixo errado.
      await onSave({
        ...form,
        width_cm: shape === 'round' ? null : form.width_cm,
        depth_cm: shape === 'round' ? null : form.depth_cm,
        diameter_cm: shape === 'round' ? form.diameter_cm : null,
      });
      toast('Configuração de AR salva', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {/* 1. Arquivo */}
        <Panel className="p-5">
          <Step number={1} title="Modelo 3D" />
          <p className="mt-1 text-[14px] text-muted">
            Envie um arquivo GLB ou GLTF de até {STORAGE_LIMITS.model.label}. Exporte com o eixo Y
            para cima e a base apoiada na origem.
          </p>

          <input
            ref={modelInputRef}
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file, 'model');
              event.target.value = '';
            }}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" loading={uploading} onClick={() => modelInputRef.current?.click()}>
              {form.model_url ? 'Trocar modelo' : 'Enviar modelo'}
            </Button>
            {form.model_url && (
              <span className="truncate text-[13px] text-muted">
                {form.format.toUpperCase()}
                {form.file_size_bytes
                  ? ` · ${Math.round(form.file_size_bytes / 1024)} KB`
                  : ''}
              </span>
            )}
          </div>

          <div className="mt-4 border-t border-hairline pt-4">
            <p className="text-[14px] font-medium">Arquivo USDZ (opcional)</p>
            <p className="mt-0.5 text-[13px] text-muted">
              O iPhone só abre realidade aumentada nativa a partir de um USDZ. Sem ele, clientes de
              iPhone veem o prato no visualizador 3D.
            </p>
            <input
              ref={usdzInputRef}
              type="file"
              accept=".usdz"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file, 'usdz');
                event.target.value = '';
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 px-0"
              onClick={() => usdzInputRef.current?.click()}
            >
              {form.usdz_url ? 'Trocar USDZ' : 'Enviar USDZ'}
            </Button>
          </div>
        </Panel>

        {/* 2. Dimensões */}
        <Panel className="p-5">
          <Step number={2} title="Dimensões reais do prato" />
          <p className="mt-1 text-[14px] text-muted">
            Meça o prato montado, com a louça. É esta medida que faz o modelo aparecer em tamanho
            real na mesa do cliente.
          </p>

          <div className="mt-3 flex rounded-[6px] border border-hairline p-0.5">
            {(
              [
                { id: 'box', label: 'Retangular' },
                { id: 'round', label: 'Redondo' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setShape(option.id)}
                aria-pressed={shape === option.id}
                className={cn(
                  'flex-1 rounded-[4px] px-3 py-1.5 text-[13px]',
                  shape === option.id ? 'bg-teal font-medium text-white' : 'text-muted',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {shape === 'round' ? (
              <Field label="Diâmetro (cm)" required>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="300"
                    value={form.diameter_cm ?? ''}
                    onChange={(event) =>
                      update('diameter_cm', event.target.value ? Number(event.target.value) : null)
                    }
                  />
                )}
              </Field>
            ) : (
              <>
                <Field label="Largura (cm)" required>
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="300"
                      value={form.width_cm ?? ''}
                      onChange={(event) =>
                        update('width_cm', event.target.value ? Number(event.target.value) : null)
                      }
                    />
                  )}
                </Field>
                <Field label="Profundidade (cm)">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="300"
                      value={form.depth_cm ?? ''}
                      onChange={(event) =>
                        update('depth_cm', event.target.value ? Number(event.target.value) : null)
                      }
                    />
                  )}
                </Field>
              </>
            )}

            <Field label="Altura (cm)" required>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="300"
                  value={form.height_cm ?? ''}
                  onChange={(event) =>
                    update('height_cm', event.target.value ? Number(event.target.value) : null)
                  }
                />
              )}
            </Field>
          </div>

          {problems.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-[8px] bg-[#F9E7E5] p-3 text-[13px] text-danger">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </Panel>

        {/* 3. Ajuste fino */}
        <Panel className="p-5">
          <Step number={3} title="Ajuste fino" />
          <p className="mt-1 text-[14px] text-muted">
            Use só se o preview mostrar o modelo torto ou deslocado. O padrão funciona para a maioria
            dos arquivos.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Field label="Escala">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="10"
                  value={form.scale_multiplier}
                  onChange={(event) => update('scale_multiplier', Number(event.target.value) || 1)}
                />
              )}
            </Field>
            <Field label="Giro Y (°)">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  step="15"
                  min="-360"
                  max="360"
                  value={form.rotation_y_deg}
                  onChange={(event) => update('rotation_y_deg', Number(event.target.value) || 0)}
                />
              )}
            </Field>
            <Field label="Giro X (°)">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  step="15"
                  min="-360"
                  max="360"
                  value={form.rotation_x_deg}
                  onChange={(event) => update('rotation_x_deg', Number(event.target.value) || 0)}
                />
              )}
            </Field>
            <Field label="Altura extra (cm)">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  step="0.5"
                  min="-100"
                  max="100"
                  value={form.offset_y_cm}
                  onChange={(event) => update('offset_y_cm', Number(event.target.value) || 0)}
                />
              )}
            </Field>
          </div>
        </Panel>

        {/* 4. Publicação */}
        <Panel className="p-5">
          <Step number={4} title="Publicar para os clientes" />
          <div className="mt-3">
            <Switch
              checked={form.ar_enabled}
              onChange={(value) => update('ar_enabled', value)}
              label="Mostrar “Ver na minha mesa” no cardápio"
              description="Desligue enquanto ajusta o modelo, sem apagar a configuração."
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="teal" loading={saving} onClick={() => void handleSave()}>
              Salvar configuração de AR
            </Button>
            {model && (
              <Button
                variant="ghost"
                className="text-danger"
                onClick={() => {
                  if (window.confirm(`Remover o modelo 3D de "${productName}"?`)) void onRemove();
                }}
              >
                Remover modelo
              </Button>
            )}
          </div>
        </Panel>
      </div>

      {/* Preview */}
      <div className="lg:sticky lg:top-20 lg:h-fit">
        <Panel className="overflow-hidden">
          <div className="border-b border-hairline px-4 py-3">
            <p className="text-[15px] font-semibold">Preview</p>
            <p className="tabular mt-0.5 text-[13px] text-muted">{formatDimensions(dimensions)}</p>
          </div>

          {form.model_url ? (
            <Suspense
              fallback={<div className="h-[340px] bg-surface" aria-label="Carregando preview" />}
            >
              <ModelViewer3D
                key={`${form.model_url}-${form.scale_multiplier}-${form.rotation_y_deg}-${form.rotation_x_deg}-${form.offset_y_cm}`}
                modelUrl={form.model_url}
                dimensions={dimensions}
                placement={placement}
                showGrid
                className="h-[340px] w-full bg-surface"
                onCalibrated={setCalibration}
              />
            </Suspense>
          ) : (
            <div className="flex h-[340px] flex-col items-center justify-center gap-2 bg-surface px-6 text-center">
              <p className="font-display text-[17px]">Sem modelo ainda</p>
              <p className="text-[13px] text-muted">
                Envie um GLB para ver como o prato vai aparecer na mesa do cliente.
              </p>
            </div>
          )}

          <div className="space-y-2 px-4 py-3 text-[13px]">
            <p className="text-muted">
              Cada quadrado da grade tem 10 cm. Use como referência de tamanho.
            </p>

            {calibration && (
              <>
                <p className="tabular">
                  Escala aplicada:{' '}
                  <strong className="font-semibold">{calibration.baseScale.toFixed(3)}×</strong> — o
                  eixo de referência é{' '}
                  {
                    {
                      width: 'a largura',
                      depth: 'a profundidade',
                      height: 'a altura',
                      diameter: 'o diâmetro',
                    }[calibration.drivingAxis]
                  }
                  .
                </p>
                {calibration.warning && (
                  <p className="rounded-[6px] bg-[#FBF0DE] p-2 text-warning">{calibration.warning}</p>
                )}
              </>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Step({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-surface font-mono text-[12px] font-semibold text-muted">
        {number}
      </span>
      <h2 className="text-[16px] font-semibold">{title}</h2>
    </div>
  );
}
