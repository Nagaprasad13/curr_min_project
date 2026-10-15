import React, { useEffect, useRef, useState } from 'react';

export function Button({ variant = 'primary', loading = false, disabled, children, className = '', ...props }) {
  return (
    <button className={`ds-button ds-button-${variant} ${className}`.trim()} disabled={disabled || loading} {...props}>
      {loading ? <span className="ds-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Input(props) {
  return <input className={`ds-control ${props.className || ''}`.trim()} {...props} />;
}

export function Select(props) {
  return <select className={`ds-control ${props.className || ''}`.trim()} {...props} />;
}

export function Textarea(props) {
  return <textarea className={`ds-control ${props.className || ''}`.trim()} {...props} />;
}

export function Checkbox({ label, ...props }) {
  return <label className="ds-checkbox"><input type="checkbox" {...props} /><span>{label}</span></label>;
}

export function FormField({ id, label, hint, error, children }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="ds-field">
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(children, { id, 'aria-invalid': Boolean(error) || undefined, 'aria-describedby': describedBy })}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && <small id={`${id}-error`} className="ds-field-error" role="alert">{error}</small>}
    </div>
  );
}

export function Card({ title, eyebrow, actions, children, className = '' }) {
  return (
    <section className={`ds-card ${className}`.trim()}>
      {(title || eyebrow || actions) && (
        <header className="ds-card-header">
          <div>{eyebrow && <p className="ds-eyebrow">{eyebrow}</p>}{title && <h2>{title}</h2>}</div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

const BADGE_ICONS = { success: '✓', warning: '!', danger: '×', info: 'i', neutral: '•' };
export function Badge({ tone = 'neutral', children }) {
  return <span className={`ds-badge ds-badge-${tone}`}><span aria-hidden="true">{BADGE_ICONS[tone] || '•'}</span>{children}</span>;
}

export function Alert({ tone = 'info', title, children, ...props }) {
  return <div className={`ds-alert ds-alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'} {...props}>
    <span className="ds-alert-icon" aria-hidden="true">{BADGE_ICONS[tone] || 'i'}</span>
    <div>{title && <strong>{title}</strong>}<div>{children}</div></div>
  </div>;
}

export function Modal({ open, title, onClose, children }) {
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
    focusable?.[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.();
      if (event.key === 'Tab') {
        const items = [...(dialog?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return <div className="ds-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
    <section ref={dialogRef} className="ds-modal" role="dialog" aria-modal="true" aria-labelledby="ds-modal-title" tabIndex="-1">
      <header><h2 id="ds-modal-title">{title}</h2><Button variant="ghost" onClick={onClose} aria-label="Close dialog">×</Button></header>
      {children}
    </section>
  </div>;
}

export function Tabs({ items, value, onChange, label = 'Sections' }) {
  const onKeyDown = (event, index) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    onChange(items[next].value);
  };
  return <div className="ds-tabs" role="tablist" aria-label={label}>
    {items.map((item, index) => <button key={item.value} type="button" role="tab" aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1} onClick={() => onChange(item.value)} onKeyDown={(event) => onKeyDown(event, index)}>{item.label}</button>)}
  </div>;
}

export function Stepper({ steps, currentStep }) {
  return <ol className="ds-stepper" aria-label="Referral progress">
    {steps.map((step, index) => <li key={step} aria-current={index === currentStep ? 'step' : undefined} className={index < currentStep ? 'is-complete' : index === currentStep ? 'is-current' : ''}>
      <span className="ds-step-number" aria-hidden="true">{index < currentStep ? '✓' : index + 1}</span><span>{step}</span>
    </li>)}
  </ol>;
}

export function Tooltip({ label, children }) {
  return <span className="ds-tooltip-wrap"><button type="button" className="ds-tooltip-trigger" aria-label={label} title={label}>?</button><span role="tooltip">{children || label}</span></span>;
}

export function Skeleton({ lines = 3 }) {
  return <div className="ds-skeleton" aria-label="Loading content" role="status">{Array.from({ length: lines }, (_, index) => <span key={index} />)}</div>;
}

export function EmptyState({ title = 'Nothing to show yet', children = 'Choose an action above to add information.' }) {
  return <div className="ds-empty"><span aria-hidden="true">◇</span><h3>{title}</h3><p>{children}</p></div>;
}

export function ErrorState({ title = 'This information could not be loaded', children = 'Check your connection and try again.', onRetry }) {
  return <Alert tone="danger" title={title}>{children}{onRetry && <div><Button variant="secondary" onClick={onRetry}>Try again</Button></div>}</Alert>;
}

export function Toast({ message, onDismiss }) {
  if (!message) return null;
  return <div className="ds-toast" role="status" aria-live="polite">{message}<Button variant="ghost" onClick={onDismiss} aria-label="Dismiss notification">×</Button></div>;
}

export function Table({ columns, rows, rowKey, label }) {
  const [sort, setSort] = useState({ key: '', direction: 'ascending' });
  const sortedRows = sort.key ? [...rows].sort((a, b) => String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? '')) * (sort.direction === 'ascending' ? 1 : -1)) : rows;
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'ascending' ? 'descending' : 'ascending' }));
  return <div className="ds-table-scroll" role="region" aria-label={`${label} table`} tabIndex="0"><table className="ds-table">
    <thead><tr>{columns.map((column) => <th key={column.key} scope="col" aria-sort={column.sortable && sort.key === column.key ? sort.direction : undefined}>{column.sortable ? <button type="button" onClick={() => changeSort(column.key)}>{column.label}</button> : column.label}</th>)}</tr></thead>
    <tbody>{sortedRows.map((row) => <tr key={rowKey ? rowKey(row) : row.id}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>)}</tbody>
  </table></div>;
}

export function useDesignTheme() {
  const [theme, setTheme] = useState(() => sessionStorage.getItem('carebridge-theme') || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    sessionStorage.setItem('carebridge-theme', theme);
  }, [theme]);
  return [theme, () => setTheme((current) => current === 'light' ? 'dark' : 'light')];
}
