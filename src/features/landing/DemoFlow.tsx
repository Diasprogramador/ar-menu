import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Demonstração do fluxo, no lugar de um mockup estático.
 *
 * Cinco quadros dentro de um aparelho desenhado em CSS: QR Code, cardápio,
 * produto, realidade aumentada e pedido. Avança sozinho, e a pessoa pode
 * assumir o controle clicando nos pontos.
 *
 * Nada aqui usa imagem externa: a página precisa carregar rápido e não pode
 * depender de um CDN de fotos para a dobra funcionar.
 */

const STEP_DURATION_MS = 3200;
const STEPS = ['QR Code', 'Cardápio', 'Produto', 'Realidade aumentada', 'Pedido'] as const;

export function DemoFlow() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (paused || reducedMotion.current) return;
    const timer = window.setTimeout(() => setStep((current) => (current + 1) % STEPS.length), STEP_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [step, paused]);

  return (
    <div
      className="flex flex-col items-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative w-full max-w-[290px]">
        {/* Aparelho */}
        <div className="relative aspect-[9/19] overflow-hidden rounded-[36px] border-[7px] border-ink bg-ink shadow-[0_20px_50px_-20px_rgba(20,17,15,0.5)]">
          <div className="absolute left-1/2 top-2 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-ink" aria-hidden />
          <div className="relative size-full overflow-hidden rounded-[28px] bg-paper">
            {step === 0 && <QrScreen />}
            {step === 1 && <MenuScreen />}
            {step === 2 && <ProductScreen />}
            {step === 3 && <ArScreen />}
            {step === 4 && <OrderScreen />}
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="mt-5 flex items-center gap-2" role="tablist" aria-label="Etapas da demonstração">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={step === index}
            aria-label={label}
            onClick={() => setStep(index)}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              step === index ? 'w-7' : 'w-1.5 bg-hairline hover:bg-faint',
            )}
            style={step === index ? { background: 'var(--ember-gradient)' } : undefined}
          />
        ))}
      </div>

      <p aria-live="polite" className="mt-2 text-[13px] text-muted">
        {STEPS[step]}
      </p>
    </div>
  );
}

/* ========================================================================== */

function Screen({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('stack-fade flex size-full flex-col', className)}>{children}</div>;
}

function QrScreen() {
  return (
    <Screen className="items-center justify-center gap-4 bg-ink px-6">
      <div className="rounded-[10px] bg-white p-3">
        <QrGlyph />
      </div>
      <p className="text-center text-[13px] leading-snug text-paper/70">
        Aponte a câmera
        <br />
        para o adesivo da mesa
      </p>
      <span className="rounded-full bg-paper/10 px-3 py-1 font-mono text-[10px] text-paper/60">
        /r/brasa-e-mesa/mesa/07
      </span>
    </Screen>
  );
}

/** QR Code decorativo em SVG, com padrão fixo para não parecer ruído. */
function QrGlyph() {
  const cells = [
    0x1fd, 0x105, 0x175, 0x175, 0x175, 0x105, 0x1fd, 0x000, 0x0aa, 0x155, 0x0d3, 0x1a9, 0x07c,
    0x000, 0x1fd, 0x105, 0x175, 0x175, 0x175, 0x105, 0x1fd,
  ];
  return (
    <svg viewBox="0 0 21 21" className="size-24" shapeRendering="crispEdges" role="img" aria-label="QR Code">
      {cells.map((row, y) =>
        Array.from({ length: 21 }, (_, x) =>
          (row >> (20 - x)) & 1 ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#14110F" /> : null,
        ),
      )}
    </svg>
  );
}

function MenuScreen() {
  return (
    <Screen>
      <div className="relative h-24 shrink-0 bg-gradient-to-br from-[#3A2A20] to-[#14110F]">
        <p className="absolute bottom-3 left-3 font-display text-[19px] text-paper">Brasa &amp; Mesa</p>
        <span className="absolute bottom-3.5 right-3 flex items-center gap-1 text-[9px] text-paper/70">
          <span className="size-1 rounded-full bg-positive" /> Aberto
        </span>
      </div>

      <div className="flex gap-1.5 px-3 py-2.5">
        {['Hambúrgueres', 'Pizzas'].map((label, index) => (
          <span
            key={label}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[9px]',
              index === 0 ? 'border-ink font-medium' : 'border-hairline text-muted',
            )}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="flex-1 space-y-2 px-3">
        {[
          ['Smash Bacon', 'R$ 42,90', true],
          ['Burger da Casa', 'R$ 39,90', true],
          ['Pizza Margherita', 'R$ 58,90', false],
        ].map(([name, price, hasAr]) => (
          <div key={String(name)} className="flex gap-2 border-b border-hairline pb-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold">{name}</p>
              <p className="tabular mt-0.5 text-[10px] font-medium">{price}</p>
              {hasAr && (
                <p className="mt-0.5 flex items-center gap-1 text-[8px] font-medium text-ember-deep">
                  <span className="inline-block h-px w-2.5 ember-rule" /> Ver na sua mesa
                </p>
              )}
            </div>
            <div className="size-11 shrink-0 rounded-[5px] bg-gradient-to-br from-[#E8DFD2] to-[#D5C6B2]" />
          </div>
        ))}
      </div>
    </Screen>
  );
}

function ProductScreen() {
  return (
    <Screen>
      <div className="h-32 shrink-0 bg-gradient-to-br from-[#E8DFD2] to-[#C9B79E]" />

      <div className="flex-1 px-3 pt-2.5">
        <p className="font-display text-[16px] leading-tight">Smash Bacon</p>
        <p className="tabular mt-1 font-display text-[15px]">R$ 42,90</p>
        <p className="mt-1.5 text-[9px] leading-snug text-muted">
          Dois discos de 90 g prensados na chapa, cheddar inglês e bacon caramelizado no bourbon.
        </p>

        <div className="mt-3 rounded-[6px] border border-hairline p-2.5">
          <div className="flex items-start gap-1.5">
            <span className="mt-1 h-px w-3 shrink-0 ember-rule" />
            <div>
              <p className="text-[10px] font-semibold">Ver na minha mesa</p>
              <p className="tabular mt-0.5 text-[8px] text-faint">12,7 × 9,9 × 12,2 cm · escala 1:1</p>
            </div>
          </div>
          <div
            className="mt-2 flex h-7 items-center justify-center rounded-[5px] text-[10px] font-medium text-white"
            style={{ background: 'var(--ember-gradient)' }}
          >
            Ver na minha mesa
          </div>
        </div>
      </div>
    </Screen>
  );
}

/**
 * Quadro da AR.
 *
 * O fundo imita o enquadramento da câmera sobre uma mesa; o retículo é o mesmo
 * anel de brasa que a sessão real desenha na superfície detectada.
 */
function ArScreen() {
  return (
    <Screen className="relative bg-[#2A2320]">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 70% at 50% 78%, #6B4A32 0%, #3A2C22 45%, #211A16 100%)',
        }}
        aria-hidden
      />

      {/* Superfície detectada */}
      <div
        className="absolute inset-x-0 bottom-0 h-[46%] opacity-25"
        style={{
          background:
            'repeating-linear-gradient(0deg, transparent 0 13px, rgba(255,255,255,0.5) 13px 14px), repeating-linear-gradient(90deg, transparent 0 13px, rgba(255,255,255,0.5) 13px 14px)',
          maskImage: 'linear-gradient(to top, black, transparent)',
          WebkitMaskImage: 'linear-gradient(to top, black, transparent)',
        }}
        aria-hidden
      />

      <div className="relative flex flex-1 items-center justify-center">
        <div className="relative">
          <BurgerGlyph />
          <div
            className="absolute -bottom-2 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full border-2 opacity-90"
            style={{ borderColor: '#FF6B2C', transform: 'translateX(-50%) rotateX(70deg)' }}
            aria-hidden
          />
        </div>
      </div>

      <div className="relative px-3 pb-3">
        <div className="mb-2 flex justify-center">
          <span className="tabular rounded-full bg-black/45 px-2.5 py-1 text-[9px] text-paper backdrop-blur-sm">
            100% · voltar ao 1:1
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-[8px] bg-black/55 p-2 backdrop-blur-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-medium text-paper">Smash Bacon</p>
            <p className="tabular text-[9px] text-paper/70">R$ 42,90</p>
          </div>
          <span
            className="rounded-[5px] px-2.5 py-1 text-[9px] font-medium text-white"
            style={{ background: 'var(--ember-gradient)' }}
          >
            Adicionar
          </span>
        </div>
      </div>
    </Screen>
  );
}

/** Hambúrguer em SVG: camadas simples, com a mesma paleta dos modelos GLB. */
function BurgerGlyph() {
  return (
    <svg viewBox="0 0 120 88" className="w-32" role="img" aria-label="Hambúrguer em realidade aumentada">
      <ellipse cx="60" cy="80" rx="46" ry="7" fill="#000" opacity="0.35" />
      <path d="M14 40c0-18 20-30 46-30s46 12 46 30z" fill="#D9A05B" />
      {[
        [38, 26],
        [56, 21],
        [74, 26],
        [48, 33],
        [68, 33],
      ].map(([cx, cy]) => (
        <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="3" ry="1.6" fill="#F3E2C0" />
      ))}
      <rect x="12" y="40" width="96" height="9" rx="4.5" fill="#5C8C3A" />
      <path d="M10 49h100l-6 8H16z" fill="#F2B33D" />
      <rect x="13" y="55" width="94" height="12" rx="5" fill="#4A2A1C" />
      <path d="M16 67h88c3 0 6 3 6 7s-3 7-6 7H16c-3 0-6-3-6-7s3-7 6-7z" fill="#C98F49" />
    </svg>
  );
}

function OrderScreen() {
  return (
    <Screen className="px-4 pt-8">
      <div className="h-px w-8 ember-rule" />
      <p className="mt-3 font-display text-[18px]">Pedido enviado</p>
      <p className="mt-1 text-[9px] text-muted">
        Cite o código <span className="font-mono font-semibold text-ink">K7QM2</span> para o garçom.
      </p>

      <span className="mt-3 w-fit rounded-[3px] bg-teal-soft px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.06em] text-teal">
        Em preparo
      </span>

      <div className="mt-4 space-y-2 border-y border-hairline py-3">
        {[
          ['1×', 'Smash Bacon', 'R$ 42,90'],
          ['1×', 'Batata Crocante', 'R$ 24,90'],
        ].map(([qty, name, price]) => (
          <div key={String(name)} className="flex gap-2 text-[10px]">
            <span className="tabular w-4 font-semibold text-muted">{qty}</span>
            <span className="flex-1">{name}</span>
            <span className="tabular">{price}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-baseline justify-between font-display text-[15px]">
        <span>Total</span>
        <span className="tabular">R$ 67,80</span>
      </div>

      <p className="mt-4 rounded-[5px] bg-surface p-2 text-[9px] leading-snug text-muted">
        O pedido foi para a cozinha identificado como <strong className="text-ink">Mesa 07</strong>.
      </p>
    </Screen>
  );
}
