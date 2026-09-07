import { create } from 'zustand';

import { cn } from '@/lib/cn';

/**
 * Avisos temporários.
 *
 * Store próprio em vez de contexto porque quem dispara um toast quase sempre
 * está fora da árvore de render — um serviço, um handler de erro, um callback
 * da sessão de AR.
 */
export type ToastTone = 'neutral' | 'success' | 'error';

type Toast = { id: number; message: string; tone: ToastTone };

type ToastState = {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone = 'neutral') => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, message, tone }] });
    window.setTimeout(() => get().dismiss(id), tone === 'error' ? 6000 : 3500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));

export function toast(message: string, tone: ToastTone = 'neutral'): void {
  useToastStore.getState().push(message, tone);
}

export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {toasts.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => dismiss(item.id)}
          className={cn(
            'stack-fade pointer-events-auto w-full max-w-sm rounded-[8px] px-4 py-3 text-left text-[15px] shadow-[0_8px_24px_rgba(20,17,15,0.18)]',
            item.tone === 'error' && 'bg-danger text-white',
            item.tone === 'success' && 'bg-positive text-white',
            item.tone === 'neutral' && 'bg-ink text-paper',
          )}
        >
          {item.message}
        </button>
      ))}
    </div>
  );
}
