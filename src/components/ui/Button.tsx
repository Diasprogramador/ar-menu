import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';

/**
 * Botão do sistema.
 *
 * A variante `ember` é reservada: ela existe apenas para a ação de AR. Usá-la
 * em outro lugar dilui o único sinal visual que diz ao cliente onde está a
 * experiência de realidade aumentada.
 */
export type ButtonVariant = 'primary' | 'ember' | 'outline' | 'ghost' | 'danger' | 'teal';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'relative inline-flex items-center justify-center gap-2 font-medium transition-[background-color,color,border-color,transform] duration-150 ' +
  'disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.985] select-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink-soft',
  ember: 'text-white shadow-[0_1px_0_rgba(0,0,0,0.08)] hover:brightness-[1.06]',
  outline: 'border border-hairline bg-paper text-ink hover:bg-surface',
  ghost: 'text-ink hover:bg-surface',
  danger: 'bg-danger text-white hover:brightness-110',
  teal: 'bg-teal text-white hover:brightness-110',
};

const sizes: Record<ButtonSize, string> = {
  // 44px é o mínimo confortável para toque em pé, segurando o celular com uma mão
  sm: 'h-9 rounded-[6px] px-3 text-sm',
  md: 'h-11 rounded-[8px] px-4 text-[15px]',
  lg: 'h-14 rounded-[10px] px-6 text-base',
};

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children?: ReactNode;
};

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, fullWidth, leading, trailing, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      style={variant === 'ember' ? { background: 'var(--ember-gradient)' } : undefined}
      {...rest}
    >
      {loading ? <Spinner /> : leading}
      <span className={cn(loading && 'opacity-70')}>{children}</span>
      {!loading && trailing}
    </button>
  );
});

type ButtonLinkProps = CommonProps & {
  to: string;
  state?: unknown;
  replace?: boolean;
  'aria-label'?: string;
};

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth,
  leading,
  trailing,
  className,
  children,
  to,
  state,
  replace,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      to={to}
      state={state}
      replace={replace}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      style={variant === 'ember' ? { background: 'var(--ember-gradient)' } : undefined}
      {...rest}
    >
      {leading}
      <span>{children}</span>
      {trailing}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cn(
        'inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}
