"use client";

import { useEffect, useRef, useState } from "react";
import { matchProduct, normalizeText } from "@/lib/match";
import type { Product } from "@/lib/products";
import { getWorker, terminateWorker } from "@/lib/tesseractWorker";

type ScanModalProps = {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onConfirmRecord: (record: {
    productId: string;
    productName: string;
    kg: number;
    source: "ocr";
    rawText: string;
  }) => void;
};

type Mode = "camera" | "confirm";

const ROI_WIDTH_RATIO = 0.95;
const ROI_HEIGHT_RATIO = 0.5;
const MAX_UPLOAD_WIDTH = 800;
const SCALE_UP = 2;

export function ScanModal({
  open,
  onClose,
  products,
  onConfirmRecord,
}: ScanModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<Mode>("camera");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [kgInput, setKgInput] = useState<string>("");
  const [showText, setShowText] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [workerReady, setWorkerReady] = useState(false);

  useEffect(() => {
    if (!open) {
      cleanupStream();
      terminateWorker();
      resetState();
      return;
    }
    startCamera();
    preloadWorker();
    return () => {
      cleanupStream();
      terminateWorker();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resetState = () => {
    setMode("camera");
    setLoading(false);
    setError(null);
    setOcrText("");
    setSelectedProductId("");
    setKgInput("");
    setShowText(false);
  };

  const cleanupStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await ensureVideoPlaying();
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Camera permission denied or unavailable.";
      setError(message);
    }
  };

  const preloadWorker = async () => {
    setWorkerReady(false);
    try {
      const worker = await getWorker();
      // Attach logger only once here for progress during recognize
      // We'll pass a logger in recognize call instead of global logger in singleton.
      if (worker) setWorkerReady(true);
    } catch {
      setError("Failed to initialize OCR.");
    }
  };

  const ensureVideoPlaying = async () => {
    const video = videoRef.current;
    if (!video || !video.srcObject) return;
    if (video.readyState < 2 || video.videoWidth === 0) {
      await new Promise<void>((resolve) => {
        const onReady = () => {
          video.removeEventListener("loadedmetadata", onReady);
          video.removeEventListener("canplay", onReady);
          resolve();
        };
        video.addEventListener("loadedmetadata", onReady, { once: true });
        video.addEventListener("canplay", onReady, { once: true });
      });
    }
    try {
      await video.play();
    } catch {
      // ignore play errors (e.g., user gesture required on some browsers)
    }
  };

  const parseKg = (text: string): number | null => {
    const normalized = normalizeText(text).replace(/,/g, ".");
    const match = normalized.match(/(\d+(?:\.\d+)?)[\s]*KG\b/);
    if (!match) return null;
    const value = parseFloat(match[1]);
    return Number.isFinite(value) ? value : null;
  };

  const clearConfirmState = () => {
    setOcrText("");
    setKgInput("");
    setSelectedProductId("");
    setShowText(false);
  };

  const handleScan = async () => {
    if (!videoRef.current) return;
    setLoading(true);
    setError(null);
    try {
      await ensureVideoPlaying();
      const dataUrl = await captureAndProcess(videoRef.current);

      const worker = await getWorker();
      if (!worker) throw new Error("OCR worker unavailable.");

      setOcrProgress(0);
      const result = await worker.recognize(dataUrl, {
        logger: (m) => {
          if (m.progress !== undefined) setOcrProgress(m.progress);
        },
      });
      const text: string = result?.data?.text || "";
      setOcrText(text);

      const matched = matchProduct(text, products);
      setSelectedProductId(matched.product?.id ?? "");

      const parsedKg = parseKg(text);
      setKgInput(parsedKg ? parsedKg.toString() : "");

      setMode("confirm");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Lỗi khi quét. Thử lại.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const captureFrame = (video: HTMLVideoElement): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const ensureReady = async () => {
        if (video.videoWidth === 0 || video.readyState < 2) {
          await new Promise<void>((res) => {
            const onReady = () => {
              video.removeEventListener("loadedmetadata", onReady);
              video.removeEventListener("canplay", onReady);
              res();
            };
            video.addEventListener("loadedmetadata", onReady, { once: true });
            video.addEventListener("canplay", onReady, { once: true });
          });
        }
      };

      ensureReady()
        .then(() => {
          const { videoWidth, videoHeight } = video;
          if (!videoWidth || !videoHeight) {
            throw new Error("Camera not ready.");
          }

          const roiWidth = videoWidth * ROI_WIDTH_RATIO;
          const roiHeight = videoHeight * ROI_HEIGHT_RATIO;
          const roiX = (videoWidth - roiWidth) / 2;
          const roiY = (videoHeight - roiHeight) / 2;

          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = roiWidth;
          cropCanvas.height = roiHeight;
          const ctx = cropCanvas.getContext("2d");
          if (!ctx) {
            throw new Error("Canvas unavailable.");
          }
          ctx.drawImage(
            video,
            roiX,
            roiY,
            roiWidth,
            roiHeight,
            0,
            0,
            roiWidth,
            roiHeight
          );

          let targetCanvas = cropCanvas;
          if (roiWidth > MAX_UPLOAD_WIDTH) {
            const scale = MAX_UPLOAD_WIDTH / roiWidth;
            const scaled = document.createElement("canvas");
            scaled.width = MAX_UPLOAD_WIDTH;
            scaled.height = roiHeight * scale;
            const sctx = scaled.getContext("2d");
            if (!sctx) {
              throw new Error("Canvas unavailable.");
            }
            sctx.drawImage(cropCanvas, 0, 0, scaled.width, scaled.height);
            targetCanvas = scaled;
          }

          targetCanvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Could not create image."));
                return;
              }
              resolve(blob);
            },
            "image/jpeg",
            0.8
          );
        })
        .catch((err) => reject(err));
    });

  const captureAndProcess = async (video: HTMLVideoElement): Promise<string> => {
    await ensureVideoPlaying();
    const blob = await captureFrame(video);
    const imageBitmap = await createImageBitmap(blob);

    const baseWidth = imageBitmap.width;
    const baseHeight = imageBitmap.height;

    const scaledWidth = Math.min(MAX_UPLOAD_WIDTH, baseWidth * SCALE_UP);
    const scale = scaledWidth / baseWidth;
    const scaledHeight = baseHeight * scale;

    const canvas = document.createElement("canvas");
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(imageBitmap, 0, 0, scaledWidth, scaledHeight);

    const imageData = ctx.getImageData(0, 0, scaledWidth, scaledHeight);
    const data = imageData.data;
    // grayscale + simple threshold/contrast
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const boosted = Math.min(255, gray * 1.35);
      const value = boosted > 160 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL("image/png");
  };

  const handleConfirm = () => {
    const kg = parseFloat(kgInput);
    if (!selectedProductId) {
      setError("Please select a product.");
      return;
    }
    if (!Number.isFinite(kg) || kg <= 0 || kg < 0.05 || kg > 50) {
      setError("Weight is invalid (0.05 - 50 kg).");
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) {
      setError("Invalid product.");
      return;
    }

    onConfirmRecord({
      productId: product.id,
      productName: product.name,
      kg,
      source: "ocr",
      rawText: ocrText,
    });

    // Ready for next scan
    setMode("camera");
    clearConfirmState();
    setError(null);
  };

  const handleClose = () => {
    cleanupStream();
    resetState();
    onClose();
  };

  if (!open) return null;

  const confirmOverlay = (
    <div className="absolute inset-0 bg-gray-950/95 px-4 py-6 overflow-y-auto">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Confirm</h2>
        <div className="flex gap-2">
          <button
            className="rounded-md bg-gray-800 px-3 py-2 text-sm"
            onClick={async () => {
              clearConfirmState();
              setError(null);
              setMode("camera");
              await ensureVideoPlaying();
            }}
          >
            Rescan
          </button>
          <button
            className="rounded-md bg-gray-800 px-3 py-2 text-sm"
            onClick={handleClose}
          >
            Close
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded bg-red-600/80 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <label className="mb-3 block text-sm">
        Product
        <select
          className="mt-1 w-full rounded-md bg-gray-800 px-3 py-2 text-white"
          value={selectedProductId}
          onChange={(e) => setSelectedProductId(e.target.value)}
        >
          <option value="">Select a product</option>
          {products.map((p) => {
            const label = p.id ? `[${p.id}] ${p.name}` : p.name;
            return (
              <option key={p.id} value={p.id}>
                {label}
              </option>
            );
          })}
        </select>
      </label>

      <label className="mb-3 block text-sm">
        Weight (kg)
        <input
          type="number"
          step="0.001"
          inputMode="decimal"
          className="mt-1 w-full rounded-md bg-gray-800 px-3 py-2 text-white"
          value={kgInput}
          onChange={(e) => setKgInput(e.target.value)}
          placeholder="Enter weight"
        />
      </label>

      <div className="mb-4">
        <button
          className="text-sm text-emerald-300 underline"
          onClick={() => setShowText((v) => !v)}
        >
          {showText ? "Hide OCR text" : "Show OCR text"}
        </button>
        {showText && (
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-gray-900 px-3 py-2 text-xs whitespace-pre-wrap">
            {ocrText || "(empty)"}
          </pre>
        )}
      </div>

      <div className="flex gap-3">
        <button
          className="flex-1 rounded-md bg-gray-800 px-4 py-3 text-white"
          onClick={async () => {
            clearConfirmState();
            setError(null);
            setMode("camera");
            await ensureVideoPlaying();
          }}
        >
          Rescan
        </button>
        <button
          className="flex-1 rounded-md bg-emerald-500 px-4 py-3 text-white"
          onClick={handleConfirm}
        >
          Confirm
        </button>
      </div>
    </div>
  );

  const cameraOverlay = (
    <div className="absolute inset-0 flex flex-col justify-between p-4">
      <div>
        <p className="text-sm text-white/80">
          Place the label inside the box, then tap Scan.
        </p>
        {error && (
          <p className="mt-2 rounded bg-red-600/80 px-3 py-2 text-sm">
            {error}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          className="flex-1 rounded-md bg-white px-4 py-3 text-black"
          onClick={handleClose}
        >
          Close
        </button>
        <button
          className="flex-1 rounded-md bg-emerald-500 px-4 py-3 text-white disabled:bg-emerald-800"
          onClick={handleScan}
          disabled={loading || !workerReady}
        >
          {loading
            ? `Reading label… ${Math.round(ocrProgress * 100)}%`
            : workerReady
              ? "Scan"
              : "Preparing OCR…"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 text-white">
      <div className="relative h-full w-full">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="border-2 border-emerald-400/90 rounded-lg bg-black/10"
            style={{
              width: `${ROI_WIDTH_RATIO * 100}%`,
              height: `${ROI_HEIGHT_RATIO * 100}%`,
            }}
          />
        </div>
        {mode === "camera" && cameraOverlay}
        {mode === "confirm" && confirmOverlay}
      </div>
    </div>
  );
}
