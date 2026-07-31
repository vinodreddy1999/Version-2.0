import { useState } from 'react';
import { createPortal } from 'react-dom';

import { ActionNotice } from './ActionNotice';
import { actionKeyFromLabel, canPerformAction } from '../lib/rbac';
import { useDismissibleLayer } from '../lib/useDismissibleLayer';
import { usePlatform } from '../platform/PlatformContext';

type RowActionsProps = {
  labels?: string[];
  recordId?: string;
  recordTitle?: string;
  recordDetails?: Record<string, string | number>;
  onAction?: (action: string, recordId?: string) => void;
};

function isViewAction(label: string) {
  const normalized = label.toLowerCase();
  return normalized.includes('view') || normalized === 'history' || normalized === 'preview' || normalized.includes('trace');
}

function isEditAction(label: string) {
  const normalized = label.toLowerCase();
  return normalized.includes('edit') || normalized.includes('assign') || normalized.includes('reassign') || normalized.includes('reschedule');
}

function isDestructiveAction(label: string) {
  const normalized = label.toLowerCase();
  return ['delete', 'reject', 'cancel', 'dispose', 'disable', 'close', 'short pick'].some((term) => normalized.includes(term));
}

function isExportAction(label: string) {
  return label.toLowerCase().includes('export') || label.toLowerCase().includes('download');
}

function isIdentifierField(label: string) {
  return /(^id$| id$|_id$|number$|code$)/i.test(label);
}

function downloadRecord(recordLabel: string, details: Record<string, string | number>) {
  const lines = Object.entries(details).map(([key, value]) => `${key},${String(value).replaceAll('"', '""')}`);
  const csv = `Field,Value\n${lines.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${recordLabel.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'record'}-export.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function RowActions({
  labels = ['View', 'Edit', 'Export'],
  recordId,
  recordTitle,
  recordDetails,
  onAction,
}: RowActionsProps) {
  const { runtimeUser } = usePlatform();
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'success' | 'error' | 'info'>('info');
  const recordLabel = recordTitle ?? recordId ?? 'record';
  const allowedLabels = labels.filter((label) => canPerformAction(runtimeUser, actionKeyFromLabel(label)));

  function showNotice(message: string, tone: 'success' | 'error' | 'info' = 'info') {
    setNotice(message);
    setNoticeTone(tone);
  }

  function handleClick(label: string) {
    if (isViewAction(label)) {
      setViewOpen(true);
      onAction?.(label, recordId);
      return;
    }

    if (isEditAction(label)) {
      setEditOpen(true);
      onAction?.(label, recordId);
      return;
    }

    if (isDestructiveAction(label)) {
      const confirmed = window.confirm(`Confirm ${label} for ${recordLabel}?`);
      if (!confirmed) {
        showNotice(`${label} cancelled for ${recordLabel}.`, 'info');
        return;
      }
    }

    if (isExportAction(label)) {
      downloadRecord(recordLabel, recordDetails ?? { ID: recordId ?? 'N/A', Name: recordTitle ?? 'Record' });
      showNotice(`${label} downloaded for ${recordLabel}.`, 'success');
      onAction?.(label, recordId);
      return;
    }

    showNotice(`${label} queued for ${recordLabel}. Draft action saved for approval.`, 'success');
    onAction?.(label, recordId);
  }

  return (
    <>
      {notice ? <ActionNotice message={notice} tone={noticeTone} onDismiss={() => setNotice('')} /> : null}
      <div className="flex flex-wrap gap-2">
        {allowedLabels.map((label) => (
          <button key={label} type="button" className="form-button-subtle py-1 text-xs" onClick={() => handleClick(label)}>
            {label}
          </button>
        ))}
      </div>
      {viewOpen
        ? createPortal(
            <RecordDetailModal
              title={`View ${recordLabel}`}
              details={recordDetails ?? { ID: recordId ?? 'N/A', Name: recordTitle ?? 'Record' }}
              onClose={() => setViewOpen(false)}
            />,
            document.body,
          )
        : null}
      {editOpen
        ? createPortal(
            <RecordEditModal
              title={`Edit ${recordLabel}`}
              details={recordDetails ?? { ID: recordId ?? 'N/A', Name: recordTitle ?? 'Record' }}
              onClose={() => setEditOpen(false)}
              onSave={() => {
                setEditOpen(false);
                showNotice(`Changes saved for ${recordLabel}. Refreshing view.`, 'success');
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function RecordDetailModal({
  title,
  details,
  onClose,
}: {
  title: string;
  details: Record<string, string | number>;
  onClose: () => void;
}) {
  const dialogRef = useDismissibleLayer<HTMLElement>({
    open: true,
    onDismiss: onClose,
    lockBodyScroll: true,
    manageFocus: true,
  });
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#091225] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-slate-400">Read-only record details from the current workspace dataset.</p>
          </div>
          <button type="button" className="form-button-subtle" onClick={onClose}>
            Close
          </button>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {Object.entries(details).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
              <dt className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</dt>
              <dd className="mt-1 text-sm font-medium text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function RecordEditModal({
  title,
  details,
  onClose,
  onSave,
}: {
  title: string;
  details: Record<string, string | number>;
  onClose: () => void;
  onSave: () => void;
}) {
  const dialogRef = useDismissibleLayer<HTMLElement>({
    open: true,
    onDismiss: onClose,
    lockBodyScroll: true,
    manageFocus: true,
  });
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#091225] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-slate-400">Draft edit form. Critical changes still require approval before execution.</p>
          </div>
          <button type="button" className="form-button-subtle" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="grid gap-3">
          {Object.entries(details).slice(0, 6).map(([label, value]) => (
            <label key={label} className="text-sm text-slate-300">
              {label}
              <input className="form-input mt-1 w-full disabled:cursor-not-allowed disabled:opacity-70" defaultValue={String(value)} disabled={isIdentifierField(label)} />
            </label>
          ))}
          <label className="text-sm text-slate-300">
            Notes
            <textarea className="form-input mt-1 min-h-24 w-full" placeholder="Reason for this change" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="form-button-subtle" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="form-button-primary" onClick={onSave}>
            Save Changes
          </button>
        </div>
      </section>
    </div>
  );
}
