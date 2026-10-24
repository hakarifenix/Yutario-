import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

let nextId = 1;

interface ToastStore {
  toasts: ToastItem[];
  notify: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  notify: (message, tone = 'info') => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { id, message, tone }] });
    setTimeout(() => get().dismiss(id), tone === 'error' ? 5200 : 3000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));

export function notify(message: string, tone: ToastTone = 'info') {
  useToasts.getState().notify(message, tone);
}
