import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { detectARCapabilities, resolveARMode, type ARCapabilities, type ARMode } from './capabilities';
import { useARSession } from './useARSession';
import { ModelViewer3D } from '@/features/models3d/ModelViewer3D';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDimensions, formatMoney } from '@/lib/format';
import type { Product, ProductModel } from '@/types/database';

/**
 * Tela cheia da experiência de AR.
 *
 * Escolhe o melhor caminho disponível no aparelho e nunca deixa a tela vazia:
 *
 *   WebXR      → câmera + hit-test + posicionamento na superfície real
 *   Quick Look → visualizador nativo do iOS, a partir do arquivo USDZ
 *   3D         → visualizador interativo com as dimensões reais informadas
 *
 * O botão de adicionar ao pedido está presente nos três caminhos: quem não tem
 * AR ainda precisa conseguir pedir.
 */

type ARExperienceProps = {
  product: Pick<Product, 'id' | 'name' | 'price_cents' | 'image_url' | 'description'>;
  model: ProductModel;
  currency: string;
  onClose: () => void;
  onAddToCart: () => void;
  onEvent?: (event: 'opened' | 'ready' | 'placed' | 'failed' | 'exited' | '3d') => void;
};

export function ARExperience({
  product,
  model,
  currency,
  onClose,
  onAddToCart,
  onEvent,
}: ARExperienceProps) {
  const [capabilities, setCapabilities] = useState<ARCapabilities | null>(null);
  const [mode, setMode] = useState<ARMode | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  const dimensions = useMemo(
    () => ({
      width_cm: model.width_cm,
      height_cm: model.height_cm,
      depth_cm: model.depth_cm,
      diameter_cm: model.diameter_cm,
    }),
    [model.width_cm, model.height_cm, model.depth_cm, model.diameter_cm],
  );

  const placement = useMemo(
    () => ({
      scaleMultiplier: model.scale_multiplier,
      rotation: { x: model.rotation_x_deg, y: model.rotation_y_deg, z: model.rotation_z_deg },
      offsetCm: { x: model.offset_x_cm, y: model.offset_y_cm, z: model.offset_z_cm },
    }),
    [model],
  );

  const session = useARSession({
    modelUrl: model.model_url,
    dimensions,
    placement,
    onEvent: (event) => {
      if (event.type === 'failed') {
        setFallbackReason('Não foi possível abrir a realidade aumentada. Veja o prato em 3D.');
        setMode('viewer-3d');
      }
      onEvent?.(event.type);
    },
  });

  useEffect(() => {
    let active = true;
    void detectARCapabilities().then((result) => {
      if (!active) return;
      setCapabilities(result);
      setMode(
        resolveARMode(result, {
          hasModel: Boolean(model.model_url),
          hasUsdz: Boolean(model.usdz_url),
          arEnabled: model.ar_enabled,
        }),
      );
      if (!result.immersiveAR && result.reason) setFallbackReason(result.reason);
    });
    return () => {
      active = false;
    };
  }, [model.model_url, model.usdz_url, model.ar_enabled]);

  const handleClose = useCallback(() => {
    session.stop();
    onClose();
  }, [session, onClose]);

  // Enquanto a sessão XR está viva, o overlay é a única coisa desenhada por
  // cima da câmera. Fora dela, ele é o próprio modal de tela cheia.
  const overlayVisible = session.isActive;

  if (!capabilities || !mode) {
    return (
      <FullScreen>
        <div className="flex flex-1 items-center justify-center gap-3 text-paper/70">
          <Spinner /> Verificando o suporte do seu aparelho…
        </div>
      </FullScreen>
    );
  }

  /* ---------------------------------------------------------------- WebXR */
  if (mode === 'webxr') {
    return (
      <>
        <div
          ref={session.overlayRef}
          className={cn(
            'fixed inset-0 z-[60] flex flex-col',
            overlayVisible ? 'bg-transparent' : 'bg-ink',
          )}
        >
          <ARTopBar
            productName={product.name}
            onClose={handleClose}
            translucent={overlayVisible}
          />

          {overlayVisible ? (
            <ARLiveControls
              session={session}
              product={product}
              model={model}
              currency={currency}
              onAddToCart={onAddToCart}
            />
          ) : (
            <ARLaunchPanel
              product={product}
              model={model}
              currency={currency}
              status={session.status}
              progress={session.progress}
              error={session.error}
              onStart={() => void session.start()}
              onFallback={() => {
                setFallbackReason(session.error?.hint ?? null);
                setMode('viewer-3d');
                onEvent?.('3d');
              }}
            />
          )}
        </div>
      </>
    );
  }

  /* ------------------------------------------------------------ Quick Look */
  if (mode === 'quick-look' && model.usdz_url) {
    return (
      <FullScreen>
        <ARTopBar productName={product.name} onClose={handleClose} />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-paper">
          <p className="font-display text-2xl">Ver na sua mesa</p>
          <p className="mt-2 max-w-xs text-sm text-paper/70">
            O iPhone abre a realidade aumentada no visualizador da Apple. Aponte a câmera para a mesa
            e o prato aparece em tamanho real.
          </p>
          <Button
            variant="ember"
            size="lg"
            className="mt-8 px-8"
            onClick={() => {
              onEvent?.('opened');
              abrirQuickLook(model.usdz_url!, product.image_url);
            }}
          >
            Abrir em realidade aumentada
          </Button>
          <button
            type="button"
            onClick={() => {
              setMode('viewer-3d');
              onEvent?.('3d');
            }}
            className="mt-4 text-sm text-paper/60 underline underline-offset-4"
          >
            Prefiro ver em 3D
          </button>
        </div>
        <ARBottomBar
          product={product}
          currency={currency}
          onAddToCart={onAddToCart}
          dimensionsLabel={formatDimensions(dimensions)}
        />
      </FullScreen>
    );
  }

  /* ------------------------------------------------------------- 3D viewer */
  if (mode === 'viewer-3d') {
    return (
      <FullScreen>
        <ARTopBar productName={product.name} onClose={handleClose} />

        {fallbackReason && (
          <p className="mx-auto mt-1 max-w-md px-6 text-center text-[13px] text-paper/60">
            {fallbackReason}
          </p>
        )}

        <div className="relative min-h-0 flex-1">
          <ModelViewer3D
            modelUrl={model.model_url}
            dimensions={dimensions}
            placement={placement}
            className="size-full"
            onReady={() => onEvent?.('3d')}
          />
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[13px] text-paper/50">
            Arraste para girar · aproxime com dois dedos
          </p>
        </div>

        <ARBottomBar
          product={product}
          currency={currency}
          onAddToCart={onAddToCart}
          dimensionsLabel={formatDimensions(dimensions)}
        />
      </FullScreen>
    );
  }

  /* ------------------------------------------------------------------ nada */
  return (
    <FullScreen>
      <ARTopBar productName={product.name} onClose={handleClose} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-paper">
        <p className="font-display text-xl">Visualização 3D indisponível</p>
        <p className="max-w-xs text-sm text-paper/70">
          Este navegador não consegue renderizar gráficos 3D. Você ainda pode ver as fotos e pedir o
          prato normalmente.
        </p>
        <Button variant="outline" className="mt-4 bg-transparent text-paper" onClick={handleClose}>
          Voltar ao prato
        </Button>
      </div>
      <ARBottomBar
        product={product}
        currency={currency}
        onAddToCart={onAddToCart}
        dimensionsLabel={formatDimensions(dimensions)}
      />
    </FullScreen>
  );
}

/* ========================================================================== */

/**
 * Abre o AR Quick Look do iOS.
 *
 * O Safari só reconhece o gesto quando o `<a rel="ar">` tem **um único filho**,
 * e esse filho é um `<img>`. Texto ao lado da imagem faz o link ser tratado como
 * um download comum — que foi exatamente o que impedia a câmera de abrir aqui.
 *
 * Por isso o link é montado na hora, com a imagem do prato como único filho, e
 * clicado por código dentro do gesto do usuário. O elemento não precisa estar
 * visível; ele existe só para carregar a semântica que o WebKit procura.
 */
function abrirQuickLook(usdzUrl: string, imagemDoPrato: string | null): void {
  const link = document.createElement('a');
  link.rel = 'ar';
  // `#allowsContentScaling=0` impede que o cliente redimensione o prato no
  // visualizador da Apple: a promessa é tamanho real, não maquete ajustável.
  link.href = `${usdzUrl}#allowsContentScaling=0`;

  const imagem = document.createElement('img');
  imagem.src = imagemDoPrato ?? '';
  imagem.alt = '';
  link.appendChild(imagem);

  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function FullScreen({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return <div className="fixed inset-0 z-[60] flex flex-col bg-ink">{children}</div>;
}

function ARTopBar({
  productName,
  onClose,
  translucent = false,
}: {
  productName: string;
  onClose: () => void;
  translucent?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]',
        translucent && 'bg-gradient-to-b from-black/55 to-transparent',
      )}
    >
      <ControlButton label="Fechar realidade aumentada" onClick={onClose}>
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
        </svg>
      </ControlButton>
      <p className="truncate text-[15px] font-medium text-paper">{productName}</p>
    </div>
  );
}

/**
 * Botão da camada de câmera.
 *
 * `beforexrselect` é cancelado aqui: sem isso, tocar em "Reposicionar" também
 * dispararia o evento `select` da sessão XR e o prato seria plantado no chão
 * atrás do dedo.
 */
function ControlButton({
  children,
  label,
  onClick,
  variant = 'glass',
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'glass' | 'ember';
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const block = (event: Event) => event.preventDefault();
    node.addEventListener('beforexrselect', block);
    return () => node.removeEventListener('beforexrselect', block);
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      data-ar-control
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-full text-paper transition-colors',
        variant === 'glass' ? 'bg-black/45 backdrop-blur-sm active:bg-black/60' : '',
      )}
      style={variant === 'ember' ? { background: 'var(--ember-gradient)' } : undefined}
    >
      {children}
    </button>
  );
}

function ARLaunchPanel({
  product,
  model,
  currency,
  status,
  progress,
  error,
  onStart,
  onFallback,
}: {
  product: ARExperienceProps['product'];
  model: ProductModel;
  currency: string;
  status: ReturnType<typeof useARSession>['status'];
  progress: number;
  error: ReturnType<typeof useARSession>['error'];
  onStart: () => void;
  onFallback: () => void;
}) {
  const busy = status === 'checking' || status === 'requesting' || status === 'loading-model';

  return (
    <div className="flex flex-1 flex-col justify-end px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-md text-center">
        <div className="mx-auto mb-6 h-px w-16 ember-rule" />
        <h2 className="font-display text-[28px] text-paper">Ver na minha mesa</h2>
        <p className="mt-2 text-sm text-paper/70">
          A câmera vai abrir. Aponte para a mesa, mova o celular devagar e toque na tela para
          posicionar o prato em tamanho real.
        </p>

        <dl className="mt-6 flex justify-center gap-6 text-left">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.08em] text-paper/45">Tamanho real</dt>
            <dd className="tabular mt-0.5 text-sm text-paper">
              {formatDimensions({
                width_cm: model.width_cm,
                height_cm: model.height_cm,
                depth_cm: model.depth_cm,
                diameter_cm: model.diameter_cm,
              })}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.08em] text-paper/45">Preço</dt>
            <dd className="tabular mt-0.5 text-sm text-paper">
              {formatMoney(product.price_cents, currency)}
            </dd>
          </div>
        </dl>

        {error && (
          <div className="mt-6 rounded-[8px] border border-paper/15 bg-paper/5 p-4 text-left">
            <p className="text-sm font-medium text-paper">{error.message}</p>
            {error.hint && <p className="mt-1 text-[13px] text-paper/60">{error.hint}</p>}
          </div>
        )}

        {status === 'loading-model' && (
          <div className="mx-auto mt-6 h-1 w-40 overflow-hidden rounded-full bg-paper/15">
            <div
              className="ember-rule h-full transition-[width] duration-200"
              style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }}
            />
          </div>
        )}

        <Button
          variant="ember"
          size="lg"
          fullWidth
          loading={busy}
          onClick={onStart}
          className="mt-7"
        >
          {error ? 'Tentar de novo' : 'Iniciar realidade aumentada'}
        </Button>

        <button
          type="button"
          onClick={onFallback}
          className="mt-4 text-sm text-paper/60 underline underline-offset-4"
        >
          Ver em 3D sem a câmera
        </button>
      </div>
    </div>
  );
}

function ARLiveControls({
  session,
  product,
  model,
  currency,
  onAddToCart,
}: {
  session: ReturnType<typeof useARSession>;
  product: ARExperienceProps['product'];
  model: ProductModel;
  currency: string;
  onAddToCart: () => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const placed = session.status === 'placed';

  return (
    <>
      <div className="flex flex-1 items-center justify-center px-8">
        {!placed && (
          <p className="rounded-full bg-black/45 px-4 py-2 text-center text-sm text-paper backdrop-blur-sm">
            {session.surfaceFound
              ? 'Toque para posicionar o prato'
              : 'Mova o celular devagar sobre a mesa'}
          </p>
        )}
      </div>

      {showInfo && (
        <div
          data-ar-control
          className="mx-4 mb-3 rounded-[10px] bg-black/60 p-4 text-paper backdrop-blur-sm"
        >
          <p className="text-[13px] text-paper/60">Tamanho real do prato</p>
          <p className="tabular mt-0.5 text-[15px]">
            {formatDimensions({
              width_cm: model.width_cm,
              height_cm: model.height_cm,
              depth_cm: model.depth_cm,
              diameter_cm: model.diameter_cm,
            })}
          </p>
          <p className="mt-2 text-[13px] text-paper/60">
            Escala aproximada 1:1 — {session.scalePercent}% do tamanho real
          </p>
          {product.description && (
            <p className="mt-2 line-clamp-3 text-[13px] text-paper/70">{product.description}</p>
          )}
        </div>
      )}

      <div className="safe-bottom px-4">
        {placed && (
          <div className="mb-3 flex items-center justify-center gap-2">
            <ControlButton label="Posicionar em outro lugar" onClick={session.reposition}>
              <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M10 3v14M3 10h14" strokeLinecap="round" />
                <circle cx="10" cy="10" r="3.2" />
              </svg>
            </ControlButton>

            <button
              type="button"
              data-ar-control
              onClick={session.resetScale}
              className="tabular h-11 rounded-full bg-black/45 px-4 text-sm text-paper backdrop-blur-sm"
            >
              {session.scalePercent}% · voltar ao 1:1
            </button>

            <ControlButton
              label={showInfo ? 'Ocultar informações' : 'Mostrar informações'}
              onClick={() => setShowInfo((value) => !value)}
            >
              <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="10" cy="10" r="7.2" />
                <path d="M10 9v4.5M10 6.4v.2" strokeLinecap="round" />
              </svg>
            </ControlButton>
          </div>
        )}

        <div
          data-ar-control
          className="flex items-center gap-3 rounded-[12px] bg-black/55 p-3 backdrop-blur-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-paper">{product.name}</p>
            <p className="tabular text-sm text-paper/70">{formatMoney(product.price_cents, currency)}</p>
          </div>
          <Button variant="ember" onClick={onAddToCart}>
            Adicionar
          </Button>
        </div>
      </div>
    </>
  );
}

function ARBottomBar({
  product,
  currency,
  onAddToCart,
  dimensionsLabel,
}: {
  product: ARExperienceProps['product'];
  currency: string;
  onAddToCart: () => void;
  dimensionsLabel: string;
}) {
  return (
    <div className="safe-bottom shrink-0 border-t border-paper/10 px-4 pt-4">
      <div className="mx-auto flex w-full max-w-md items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-paper">{product.name}</p>
          <p className="tabular truncate text-[13px] text-paper/55">{dimensionsLabel}</p>
        </div>
        <div className="text-right">
          <p className="tabular text-[15px] text-paper">{formatMoney(product.price_cents, currency)}</p>
        </div>
        <Button variant="ember" onClick={onAddToCart}>
          Adicionar
        </Button>
      </div>
    </div>
  );
}
