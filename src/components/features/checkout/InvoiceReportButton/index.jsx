'use client';

import { useState, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import { Printer, Loader2, X, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getDocumentReports } from '@/services/documentConfigService';
import { login as loginToOrnaverse } from '@/services/authService';
import { selectAuthUser } from '@/store/slices/authSlice';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {{
 *   transactionId?: number,
 *   resolveTransactionId?: () => Promise<number|null>, — alternative to a
 *     static transactionId: called once, lazily, the moment the button is
 *     clicked (e.g. Custom Estimate's temp voucher, which must be created
 *     fresh per print so it reflects the current, possibly-just-edited line).
 *   documentId?: number,
 *   documentLabel?: string,
 * }} props
 */
export default function InvoiceReportButton({
  transactionId,
  resolveTransactionId,
  documentId = APP_CONFIG.DOCUMENT_TYPES.POS_INVOICE,
  documentLabel = 'Invoice',
}) {
  const [resolvedTransactionId, setResolvedTransactionId] = useState(transactionId);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [html, setHtml] = useState(null);
  const [reportId, setReportId] = useState(null);
  const [renderError, setRenderError] = useState(null);
  const [isRendering, setIsRendering] = useState(false);
  const frameRef = useRef(null);

  const authUser = useSelector(selectAuthUser);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [reconnectPassword, setReconnectPassword] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState(null);
  const lastReportRef = useRef(null); // the report that hit a 401, to retry after reconnecting

  const { data: reports = [], isLoading } = useQuery({
    queryKey:  ['document-reports', documentId],
    queryFn:   () => getDocumentReports(documentId),
    staleTime: APP_CONFIG.STALE_TIME.STATIC,
  });

  const openReport = async (report) => {
    lastReportRef.current = report;
    setIsOpen(false);
    setRenderError(null);
    setNeedsReconnect(false);
    setIsRendering(true);
    try {
      const response = await fetch('/api/report/render', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportKey:       report.report_key,
          opt:             { transaction_id: resolvedTransactionId },
          reportFile:      report.report_file,
          reportFolder:    report.report_folder,
          reportSubFolder: report.report_sub_folder ?? '',
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setNeedsReconnect(true);
          setIsRendering(false);
          return;
        }
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Could not render this report (HTTP ${response.status}).`);
      }

      const renderedHtml = await response.text();
      setHtml(renderedHtml);
      setReportId(renderedHtml.match(/reportId=([0-9a-f]+)/)?.[1] ?? null);
    } catch (err) {
      setRenderError(err.message);
    } finally {
      setIsRendering(false);
    }
  };

  const handleReconnect = async () => {
    if (!reconnectPassword) return;
    setIsReconnecting(true);
    setReconnectError(null);
    try {
      await loginToOrnaverse(authUser?.username, reconnectPassword);
      setReconnectPassword('');
      setNeedsReconnect(false);
      if (lastReportRef.current) await openReport(lastReportRef.current);
    } catch (err) {
      setReconnectError(err?.message ?? 'Incorrect password, or OrnaVerse could not be reached. Please try again.');
    } finally {
      setIsReconnecting(false);
    }
  };

  // The live preview iframe shows ONE page at a time (FastReport's viewer
  // swaps the whole page on navigation, never holds every page in the DOM
  // at once) — contentWindow.print() on it would only ever print whatever
  // page happens to be loaded. FastReport's own printReport endpoint
  // (same one its toolbar's "Print from browser" link uses) renders every
  // page as one standalone document and prints itself on load, so that's
  // what actually gets every page, regardless of which page is on screen.
  const printReport = () => {
    if (!reportId) return;
    window.open(`/_fr/preview.printReport?reportId=${reportId}&printMode=html`, '_blank');
  };

  const handleToggleOpen = async () => {
    if (isOpen) { setIsOpen(false); return; }
    if (!resolveTransactionId) { setIsOpen(true); return; }
    setIsResolving(true);
    setResolveError(null);
    try {
      const id = await resolveTransactionId();
      if (!id) throw new Error(`Could not prepare this ${documentLabel.toLowerCase()} for printing.`);
      setResolvedTransactionId(id);
      setIsOpen(true);
    } catch (err) {
      setResolveError(err?.message ?? 'Something went wrong.');
    } finally {
      setIsResolving(false);
    }
  };

  if (!isLoading && reports.length === 0) return null;

  return (
    <div className="flex w-full flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full gap-2"
        disabled={isLoading || isRendering || isResolving || (!resolveTransactionId && !resolvedTransactionId)}
        onClick={handleToggleOpen}
      >
        {isLoading ? (
          <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading formats…</>
        ) : isResolving ? (
          <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Preparing {documentLabel.toLowerCase()}…</>
        ) : isRendering ? (
          <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Preparing {documentLabel.toLowerCase()}…</>
        ) : (
          <><Printer size={18} aria-hidden="true" /> Print {documentLabel}</>
        )}
      </Button>

      {resolveError && (
        <p className="rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          {resolveError}
        </p>
      )}

      {isOpen && reports.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2">
          <p className="px-2 py-1 text-xs text-muted-foreground">Select a format</p>
          {reports.map((report) => (
            <button
              key={report.report_id}
              type="button"
              onClick={() => openReport(report)}
              className="rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
            >
              {report.report_name}
            </button>
          ))}
        </div>
      )}

      {renderError && (
        <p className="rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
          {renderError}
        </p>
      )}

      {needsReconnect && (
        <div className="flex flex-col gap-2 rounded-xl border border-status-error/30 bg-status-error/5 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-status-error">
            <Lock size={14} aria-hidden="true" />
            Your OrnaVerse print session needs to reconnect
          </div>
          <p className="text-xs text-muted-foreground">
            Enter {authUser?.username ? <span className="font-medium text-foreground">{authUser.username}</span> : 'your'}
            {'’'}s password to continue — this only re-establishes printing, you stay signed in and your cart is untouched.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={reconnectPassword}
              onChange={(e) => setReconnectPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleReconnect(); }}
              placeholder="Password"
              autoComplete="current-password"
              disabled={isReconnecting}
              className="h-9 flex-1"
            />
            <Button
              type="button"
              onClick={handleReconnect}
              disabled={isReconnecting || !reconnectPassword}
              className="h-9 shrink-0"
            >
              {isReconnecting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : 'Reconnect'}
            </Button>
          </div>
          {reconnectError && (
            <p className="text-xs text-status-error">{reconnectError}</p>
          )}
        </div>
      )}

      {html && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4">
          <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold text-foreground">{documentLabel} preview</h2>
              <div className="flex items-center gap-2">
                <Button type="button" onClick={printReport} disabled={!reportId} className="h-9 gap-2">
                  <Printer size={16} aria-hidden="true" /> Print
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setHtml(null); setReportId(null); }}
                  className="h-9 w-9 p-0"
                  aria-label="Close preview"
                >
                  <X size={16} aria-hidden="true" />
                </Button>
              </div>
            </div>
            <iframe
              ref={frameRef}
              srcDoc={html}
              title={`${documentLabel} preview`}
              className="h-full w-full flex-1 bg-white"
              sandbox="allow-same-origin allow-modals allow-scripts"
            />
          </div>
        </div>
      )}
    </div>
  );
}
