import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Info, Trash2, X } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' for destructive actions (delete, remove), 'default' otherwise */
  tone?: 'default' | 'danger';
}

type ToastTone = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface FeedbackContextValue {
  /** Styled replacement for window.confirm. Resolves true when confirmed. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Styled replacement for window.alert: a transient toast. */
  notify: (message: string, tone?: ToastTone) => void;
}

const TOAST_DURATION_MS = 5000;
const MAX_TOASTS = 4;

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used inside <FeedbackProvider>');
  }
  return ctx;
}

const TOAST_ICONS: Record<ToastTone, ReactNode> = {
  error: <AlertTriangle size={18} />,
  success: <CheckCircle2 size={18} />,
  info: <Info size={18} />,
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const resolverRef = useRef<((result: boolean) => void) | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const nextToastId = useRef(1);

  const confirm = useCallback((options: ConfirmOptions) => {
    // A second request while one is open cancels the first
    resolverRef.current?.(false);
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setDialog(options);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setDialog(null);
    returnFocusRef.current?.focus?.();
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextToastId.current++;
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, message, tone }]);
      setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
    },
    [dismissToast]
  );

  // Focus the safe choice for destructive actions, the primary one otherwise
  useEffect(() => {
    if (!dialog) return;
    (dialog.tone === 'danger' ? cancelBtnRef : confirmBtnRef).current?.focus();
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        settle(false);
      } else if (e.key === 'Tab') {
        // Two-button focus trap
        e.preventDefault();
        const next =
          document.activeElement === cancelBtnRef.current ? confirmBtnRef : cancelBtnRef;
        next.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [dialog, settle]);

  const value = useMemo(() => ({ confirm, notify }), [confirm, notify]);
  const isDanger = dialog?.tone === 'danger';

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {dialog && (
        <div className="dialog-backdrop" onClick={() => settle(false)}>
          <div
            className={`dialog-box ${isDanger ? 'danger' : ''}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            aria-describedby={dialog.message ? 'dialog-message' : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="dialog-icon" aria-hidden="true">
              {isDanger ? <Trash2 size={22} /> : <HelpCircle size={22} />}
            </span>
            <h2 id="dialog-title" className="dialog-title">
              {dialog.title}
            </h2>
            {dialog.message && (
              <p id="dialog-message" className="dialog-message">
                {dialog.message}
              </p>
            )}
            <div className="dialog-actions">
              <button
                ref={cancelBtnRef}
                type="button"
                className="dialog-btn"
                onClick={() => settle(false)}
              >
                {dialog.cancelLabel ?? 'Cancel'}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                className={`dialog-btn ${isDanger ? 'danger' : 'primary'}`}
                onClick={() => settle(true)}
              >
                {dialog.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`} role="status">
            <span className="toast-icon" aria-hidden="true">
              {TOAST_ICONS[toast.tone]}
            </span>
            <span className="toast-message">{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}
