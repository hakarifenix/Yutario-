import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { pushBackHandler } from '../lib/back';
import { useT } from '../lib/i18n';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: 'ghost' | 'surface' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
};

const sizeClasses: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
};

const variantClasses: Record<NonNullable<IconButtonProps['variant']>, string> = {
  ghost: 'text-ink/80 hover:bg-surface-2 active:bg-surface-2',
  surface: 'bg-surface-2 text-ink border border-line/70',
  accent: 'bg-gradient-to-br from-accent to-accent-2 text-white shadow-glow',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={`tap inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

export function Spinner({ className = '', size = 18 }: { className?: string; size?: number }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="tap rounded-lg px-1 text-xs font-semibold text-accent"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  secondaryAction,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-line/60 bg-surface/60 px-6 py-10 text-center">
      {icon ? (
        <div className="mb-3 flex h-12 w-12 animate-scale-in items-center justify-center rounded-2xl bg-accent/10 text-accent">
          {icon}
        </div>
      ) : null}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body ? <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted">{body}</p> : null}
      {action || secondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="tap rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
            >
              {action.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="tap rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink"
            >
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  maxHeight = '72vh',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxHeight?: string;
}) {
  const t = useT();
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    const release = pushBackHandler(() => {
      onClose();
      return true;
    });
    return release;
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        aria-label={t('a11y.close')}
        onClick={onClose}
        className="absolute inset-0 h-full w-full animate-fade-in bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative w-full max-w-xl animate-slide-up overflow-hidden rounded-t-3xl border border-line/70 bg-surface shadow-lift"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" />
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
          <h2 id={headingId} className="text-[15px] font-semibold text-ink">
            {title}
          </h2>
          <IconButton label={t('a11y.close')} size="sm" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-4 pb-4" style={{ maxHeight }}>
          {children}
        </div>
        {footer ? <div className="border-t border-line/60 px-4 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Dialog({
  open,
  title,
  message,
  children,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onClose,
  confirmDisabled = false,
}: {
  open: boolean;
  title: string;
  message?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  confirmDisabled?: boolean;
}) {
  const t = useT();
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    return pushBackHandler(() => {
      onClose();
      return true;
    });
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-5">
      <button
        type="button"
        aria-label={t('a11y.close')}
        onClick={onClose}
        className="absolute inset-0 h-full w-full animate-fade-in bg-black/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative w-full max-w-sm animate-scale-in rounded-2xl border border-line/70 bg-surface p-5 shadow-lift"
      >
        <h2 id={headingId} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {message ? <p className="mt-2 text-[13px] leading-relaxed text-muted">{message}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="tap rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink"
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
            className={`tap rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${
              danger ? 'bg-danger' : 'bg-accent'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  autoFocus,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => ref.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSubmit?.();
      }}
      placeholder={placeholder}
      className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
      enterKeyHint="done"
    />
  );
}

export function Slider({
  value,
  max,
  onChange,
  onCommit,
  disabled,
  label,
  step = 1,
}: {
  value: number;
  max: number;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
  disabled?: boolean;
  label: string;
  step?: number;
}) {
  const safeMax = max > 0 ? max : 1;
  const percent = Math.max(0, Math.min(100, (value / safeMax) * 100));
  return (
    <input
      type="range"
      className="yr-range"
      aria-label={label}
      min={0}
      max={safeMax}
      step={step}
      value={Math.max(0, Math.min(value, safeMax))}
      disabled={disabled}
      style={{ ['--range-progress' as string]: `${percent}%` }}
      onChange={(event) => onChange?.(Number(event.target.value))}
      onPointerUp={(event) => onCommit?.(Number((event.target as HTMLInputElement).value))}
      onKeyUp={(event) => onCommit?.(Number((event.target as HTMLInputElement).value))}
    />
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4" role="tablist">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`tap whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              active ? 'bg-accent text-white' : 'bg-surface-2 text-muted'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toaster({ toasts, onDismiss }: { toasts: { id: number; message: string; tone: string }[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => onDismiss(toast.id)}
          className={`pointer-events-auto max-w-sm animate-fade-up rounded-xl border px-3.5 py-2.5 text-[13px] font-medium shadow-lift ${
            toast.tone === 'error'
              ? 'border-danger/40 bg-danger/15 text-ink'
              : 'border-line/70 bg-surface text-ink'
          }`}
        >
          {toast.message}
        </button>
      ))}
    </div>,
    document.body,
  );
}
