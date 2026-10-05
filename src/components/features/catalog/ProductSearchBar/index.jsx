'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Search, X, ScanBarcode } from 'lucide-react';
import { Input } from '@/components/ui/input';
import APP_CONFIG from '@/constants/appConfig';

const BarcodeScannerModal = dynamic(
  () => import('@/components/features/catalog/BarcodeScannerModal'),
  { ssr: false },
);

const { SEARCH } = APP_CONFIG;

// If Enter is pressed within this many ms of the last keystroke, treat as scan.
const SCAN_THRESHOLD_MS = 80;

/**
 * @param {object}    props
 * @param {string}    props.value              - Controlled value from URL/parent
 * @param {function}  props.onSearch           - Called with debounced text query
 * @param {function}  props.onBarcodeDetected  - Called with raw code string on scan
 */
export default function ProductSearchBar({
  value,
  onSearch,
  onBarcodeDetected,
}) {
  const normalizedValue = value ?? '';
  const [inputVal,      setInputVal]      = useState(normalizedValue);
  const [lastSyncedValue, setLastSyncedValue] = useState(normalizedValue);
  const [cameraOpen,    setCameraOpen]    = useState(false);
  const debounceRef    = useRef(null);
  const lastKeyTimeRef = useRef(null);
  const inputRef      = useRef(null);
  const lastScanRef    = useRef(null);
  
  if (normalizedValue !== lastSyncedValue) {
    setLastSyncedValue(normalizedValue);
    setInputVal(normalizedValue);
  }

  const fireSearch = useCallback((q) => {
    clearTimeout(debounceRef.current);
    if (q === '') { onSearch(''); return; }
    debounceRef.current = setTimeout(() => onSearch(q), SEARCH.DEBOUNCE_MS);
  }, [onSearch]);

  const handleChange = (e) => {
    lastKeyTimeRef.current = Date.now();
    setInputVal(e.target.value);
    fireSearch(e.target.value);
  };

  const handleClear = () => {
    clearTimeout(debounceRef.current);
    setInputVal('');
    onSearch('');
    inputRef.current?.focus();
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      handleClear();
      return;
    }

    if (e.key === 'Enter') {
      const val = inputVal.trim();
      if (!val) return;

      // Barcode detection: Enter fired very quickly after last keystroke = scanner
      const timeSinceLastKey = lastKeyTimeRef.current
        ? Date.now() - lastKeyTimeRef.current
        : Infinity;

      if (timeSinceLastKey <= SCAN_THRESHOLD_MS && onBarcodeDetected) {
        // Debounce — ignore the same scanned value re-firing within 2s.
        const prev = lastScanRef.current;
        if (prev?.code === val && Date.now() - prev.ts < 2000) {
          return;
        }
        lastScanRef.current = { code: val, ts: Date.now() };

        // Clear debounced text search — barcode takes over
        clearTimeout(debounceRef.current);
        onBarcodeDetected(val);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputVal, onBarcodeDetected]);

  const handleScanIconClick = () => setCameraOpen(true);

  const handleCameraDetected = useCallback((code) => {
    setCameraOpen(false);
    setInputVal(code);
    if (onBarcodeDetected) {
      onBarcodeDetected(code);
    }
  }, [onBarcodeDetected]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const showClear = inputVal.length > 0;

  return (
    <>
      <div className="w-full">
        <div className="relative flex-1 bg-white">

          <span
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          >
            <Search size={16} />
          </span>

          <Input
            ref={inputRef}
            type="text"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search For Product"
            value={inputVal}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            aria-label="Search products or scan barcode"
            className="min-h-[44px] pl-9 pr-16"
          />

          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {showClear ? (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                className="flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleScanIconClick}
                aria-label="Open camera to scan barcode"
                title="Scan barcode with camera"
                className="flex items-center justify-center w-7 h-7 rounded-full transition-colors text-muted-foreground hover:text-primary hover:bg-primary/10"
              >
                <ScanBarcode size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
      {cameraOpen && (
        <BarcodeScannerModal
          isOpen={cameraOpen}
          onDetected={handleCameraDetected}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );
}