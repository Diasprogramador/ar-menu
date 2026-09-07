import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '@/lib/cn';

export { Button, ButtonLink, Spinner } from './Button';

/* -------------------------------------------------------------------------
 * Superfícies
 * ---------------------------------------------------------------------- */

/**
 * Painel do sistema. Separação por fio de 1px, não por sombra: o cardápio deve
 * parecer peça impressa, e um dashboard sem sombras respira melhor.
 */
export function Panel({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return <Tag className={cn('rounded-[10px] border border-hairline bg-paper', className)}>{children}</Tag>;
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'ember' | 'positive' | 'warning' | 'danger' | 'teal';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-surface text-muted',
    ember: 'bg-ember-wash text-ember-deep',
    positive: 'bg-[#E8F1EC] text-positive',
    warning: 'bg-[#FBF0DE] text-warning',
    danger: 'bg-[#F9E7E5] text-danger',
    teal: 'bg-teal-soft text-teal',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-[6px]', className)} />;
}

/* -------------------------------------------------------------------------
 * Estados
 * ---------------------------------------------------------------------- */

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 text-faint">{icon}</div>}
      <h3 className="font-display text-xl">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Algo deu errado',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-[#F9E7E5] text-danger">!</div>
      <h3 className="font-display text-lg">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 h-10 rounded-[8px] border border-hairline px-4 text-sm font-medium hover:bg-surface"
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Imagem com degradação previsível
 * ---------------------------------------------------------------------- */

/**
 * Imagem de produto. Reserva a proporção antes de carregar para não empurrar o
 * layout, e substitui a foto quebrada por um plano de fundo com a inicial do
 * prato — a alternativa seria um ícone de imagem quebrada no cardápio.
 */
export function SmartImage({
  src,
  alt,
  className,
  imgClassName,
  ratio = '4/3',
  priority = false,
  fallbackLabel,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  imgClassName?: string;
  ratio?: string;
  priority?: boolean;
  fallbackLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  const showFallback = !src || failed;

  return (
    <div
      className={cn('relative overflow-hidden bg-surface-deep', className)}
      style={{ aspectRatio: ratio }}
    >
      {showFallback ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface to-surface-deep">
          <span className="font-display text-2xl text-faint">
            {(fallbackLabel ?? alt).charAt(0).toUpperCase()}
          </span>
        </div>
      ) : (
        <>
          {!loaded && <div className="skeleton absolute inset-0" />}
          <img
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn(
              'absolute inset-0 size-full object-cover transition-opacity duration-300',
              loaded ? 'opacity-100' : 'opacity-0',
              imgClassName,
            )}
          />
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Formulário
 * ---------------------------------------------------------------------- */

const fieldShell =
  'w-full rounded-[8px] border border-hairline bg-paper px-3 text-[15px] outline-none transition-colors ' +
  'placeholder:text-faint focus:border-ink disabled:bg-surface disabled:text-muted';

type FieldWrapperProps = {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (id: string) => ReactNode;
};

export function Field({ label, hint, error, required, className, children }: FieldWrapperProps) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium text-ink-soft">
          {label}
          {required && <span className="ml-0.5 text-ember-deep">*</span>}
        </label>
      )}
      {children(id)}
      {error ? (
        <p className="text-[13px] text-danger">{error}</p>
      ) : (
        hint && <p className="text-[13px] text-muted">{hint}</p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(fieldShell, 'h-11', invalid && 'border-danger', className)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldShell, 'min-h-24 resize-y py-2.5 leading-relaxed', invalid && 'border-danger', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(fieldShell, 'h-11 appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
    );
  },
);

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex items-start gap-3', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 h-6 w-10 shrink-0 rounded-full border transition-colors',
          checked ? 'border-transparent bg-ink' : 'border-hairline bg-surface',
        )}
      >
        <span
          className={cn(
            'block size-4 rounded-full bg-paper transition-transform duration-200',
            checked ? 'translate-x-[19px]' : 'translate-x-[3px]',
          )}
        />
      </button>
      <span className="flex flex-col">
        <span className="text-[15px] font-medium">{label}</span>
        {description && <span className="text-[13px] text-muted">{description}</span>}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------
 * Modal em folha (bottom sheet no celular, diálogo centrado no desktop)
 * ---------------------------------------------------------------------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;

      // Prende o foco dentro do diálogo enquanto ele está aberto
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.querySelector<HTMLElement>('button, input, a')?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'stack-fade relative flex max-h-[92vh] w-full flex-col rounded-t-[16px] bg-paper sm:rounded-[12px]',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <header className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="font-display text-lg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-2 flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && <footer className="safe-bottom border-t border-hairline px-5 pt-4">{footer}</footer>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Métrica do painel
 * ---------------------------------------------------------------------- */

export function StatTile({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'neutral' | 'ember' | 'teal';
}) {
  return (
    <Panel className="p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p
        className={cn(
          'tabular mt-1 font-display text-[26px] leading-none',
          tone === 'ember' && 'ember-text',
          tone === 'teal' && 'text-teal',
        )}
      >
        {value}
      </p>
      {detail && <p className="mt-1.5 text-[13px] text-faint">{detail}</p>}
    </Panel>
  );
}
