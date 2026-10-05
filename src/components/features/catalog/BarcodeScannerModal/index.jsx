'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X, RefreshCw, Camera } from 'lucide-react';

/**
 * @param {object}   props
 * @param {boolean}  props.isOpen      - Controls visibility
 * @param {function} props.onDetected  - Called with decoded barcode string
 * @param {function} props.onClose     - Called to close the modal
 */
export default function BarcodeScannerModal({ isOpen, onDetected, onClose }) {
  const videoRef      = useRef(null);
  const readerRef     = useRef(null);
  const controlsRef   = useRef(null);

  const [cameras,       setCameras]       = useState([]);
  const [cameraIndex,   setCameraIndex]   = useState(0);
  const [error,         setError]         = useState(null);
  const [scanning,      setScanning]      = useState(false);
  const lastScannedRef = useRef(null);

  const stopStream = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch (_) {}
    controlsRef.current = null;
    setScanning(false);
  }, []);

  const startScanning = useCallback(async (deviceId) => {
    if (!videoRef.current) return;
    stopStream();
    setError(null);
    setScanning(true);

    try {
      const reader = readerRef.current;
      const controls = await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result, err) => {
          if (result) {
            const code = result.getText();
            // Debounce — ignore same code within 2s to prevent double-fire
            const prev = lastScannedRef.current;
            if (prev?.code === code && Date.now() - prev.ts < 2000) {
            } else {
              lastScannedRef.current = { code, ts: Date.now() };
              onDetected(code);
            }
          }
          // NotFoundException fires constantly when no barcode in frame — ignore silently
          if (err && err.name !== 'NotFoundException') {
            console.warn('[BarcodeScanner] decode error:', err);
          }
        },
      );
      controlsRef.current = controls;
    } catch (err) {
      setScanning(false);
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access and try again.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError('Could not start camera. Please try again.');
      }
    }
  }, [stopStream, onDetected]);

  useEffect(() => {
    if (!isOpen) return;

    readerRef.current = new BrowserMultiFormatReader();

    let cancelled = false;

    async function init() {
      try {
        // Enumerate devices — triggers permission prompt on first call
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;

        if (!devices.length) {
          setError('No camera devices found.');
          return;
        }

        setCameras(devices);

        const backIndex = devices.findIndex((d) =>
          /back|rear|environment/i.test(d.label)
        );
        const startIndex = backIndex >= 0 ? backIndex : 0;
        setCameraIndex(startIndex);
        await startScanning(devices[startIndex].deviceId);
      } catch (err) {
        if (!cancelled) {
          setError('Could not access cameras. Please check permissions.');
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      stopStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleFlipCamera = useCallback(async () => {
    if (cameras.length <= 1) return;
    const nextIndex = (cameraIndex + 1) % cameras.length;
    setCameraIndex(nextIndex);
    await startScanning(cameras[nextIndex].deviceId);
  }, [cameras, cameraIndex, startScanning]);

  const handleClose = useCallback(() => {
    stopStream();
    setError(null);
    lastScannedRef.current = null;
    onClose();
  }, [stopStream, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={handleClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Scan barcode"
        className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 max-w-sm mx-auto"
      >
        <div className="rounded-2xl overflow-hidden bg-black shadow-2xl">

          <div className="flex items-center justify-between px-4 py-3 bg-black/80">
            <div className="flex items-center gap-2 text-white">
              <Camera size={16} aria-hidden="true" />
              <span className="text-sm font-medium">Scan Barcode</span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close scanner"
              className="flex items-center justify-center w-8 h-8 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="relative w-full aspect-square bg-black">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline  // required on iOS
            />

            {scanning && !error && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-52 h-52">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-sm" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-sm" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-sm" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-sm" />
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-primary/80 animate-scan-line" />
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
                <Camera size={32} className="text-white/40" />
                <p className="text-sm text-white/80">{error}</p>
                <button
                  type="button"
                  onClick={() => cameras.length && startScanning(cameras[cameraIndex]?.deviceId)}
                  className="px-4 py-2 rounded-full bg-primary text-white text-sm font-medium"
                >
                  Retry
                </button>
              </div>
            )}

            {!scanning && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div className="flex flex-col items-center gap-2 text-white/60">
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="text-xs">Starting camera…</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-3 bg-black/80">
            <p className="text-xs text-white/50">
              {cameras.length > 1
                ? `Camera ${cameraIndex + 1} of ${cameras.length}`
                : 'Point camera at barcode'}
            </p>
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={handleFlipCamera}
                aria-label="Switch camera"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition-colors"
              >
                <RefreshCw size={13} />
                Flip
              </button>
            )}
          </div>

        </div>
      </div>
    </>
  );
}