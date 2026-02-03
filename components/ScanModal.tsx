"use client";

import { useEffect, useRef, useState } from "react";
import {
  createWorker,
  PSM,
  type Worker as TesseractWorker,
  type LoggerMessage,
} from "tesseract.js";
import { matchProduct, normalizeText } from "@/lib/match";
import type { Product } from "@/lib/products";

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
  const workerRef = useRef<TesseractWorker | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const [mode, setMode] = useState<Mode>("camera");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [kgInput, setKgInput] = useState<string>("");
  const [showText, setShowText] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Preparing");
  const [statusText, setStatusText] = useState(
    "Hold the label steady inside the frame…"
  );
  const rafRef = useRef<number | null>(null);
  const lastSampleRef = useRef<number>(0);
  const lastSmallFrameRef = useRef<ImageData | null>(null);
  const stableSinceRef = useRef<number | null>(null);
  const scanningLockRef = useRef(false);
  const cooldownUntilRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!open) {
      cleanupStream();
      resetState();
      return;
    }
    startCamera();
    initWorker();
    return () => {
      cleanupStream();
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
    setProgressStatus("Preparing");
    setStatusText("Hold the label steady inside the frame…");
    setOcrProgress(0);
    stableSinceRef.current = null;
    lastSmallFrameRef.current = null;
    scanningLockRef.current = false;
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

  const initWorker = async () => {
    if (workerRef.current) return;
    try {
      type FullWorker = TesseractWorker & {
        load: () => Promise<void>;
        loadLanguage: (lang: string) => Promise<void>;
        initialize: (lang: string) => Promise<void>;
        setParameters: (params: Record<string, unknown>) => Promise<void>;
      };
      const worker = (await createWorker("fin+swe", undefined, {
        logger: (m: LoggerMessage) => {
          if (m.progress !== undefined) setOcrProgress(m.progress);
        },
      })) as FullWorker;
      await worker.load();
      await worker.loadLanguage("fin+swe");
      await worker.initialize("fin+swe");
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK, // PSM 6
      });
      workerRef.current = worker;
      setWorkerReady(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to initialize OCR.";
      setError(message);
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

      if (!workerRef.current) {
        await initWorker();
      }
      if (!workerRef.current) {
        throw new Error("OCR worker unavailable.");
      }

      setOcrProgress(0);
      const result = await workerRef.current.recognize(dataUrl);
      const text: string = result?.data?.text || "";
      setOcrText(text);

      const matched = matchProduct(text, products);
      setSelectedProductId(matched.product?.id ?? "");

      const parsedKg = parseKg(text);
      setKgInput(parsedKg ? parsedKg.toString() : "");

      setMode("confirm");
      playBeep();
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
    cooldownUntilRef.current = performance.now() + 800;
    setStatusText("Hold the label steady inside the frame…");
  };

  const handleClose = () => {
    cleanupStream();
    resetState();
    onClose();
  };

  // Lightweight stability detection loop
  useEffect(() => {
    if (!open) return;
    const sample = () => {
      const now = performance.now();
      if (mode !== "camera" || loading) {
        rafRef.current = requestAnimationFrame(sample);
        return;
      }
      if (now < cooldownUntilRef.current) {
        setStatusText("Cooling down…");
        rafRef.current = requestAnimationFrame(sample);
        return;
      }
      if (!videoRef.current) {
        rafRef.current = requestAnimationFrame(sample);
        return;
      }
      if (now - lastSampleRef.current < 120) {
        rafRef.current = requestAnimationFrame(sample);
        return;
      }
      lastSampleRef.current = now;
      const small = sampleSmallFrame(videoRef.current);
      if (!small) {
        rafRef.current = requestAnimationFrame(sample);
        return;
      }
      if (!lastSmallFrameRef.current) {
        lastSmallFrameRef.current = small;
        rafRef.current = requestAnimationFrame(sample);
        return;
      }
      const diff = frameDiff(lastSmallFrameRef.current, small);
      lastSmallFrameRef.current = small;
      const threshold = 12;
      if (diff < threshold) {
        if (stableSinceRef.current === null) stableSinceRef.current = now;
        if (
          !scanningLockRef.current &&
          workerReady &&
          now - (stableSinceRef.current ?? now) > 500
        ) {
          scanningLockRef.current = true;
          setStatusText("Stable — scanning…");
          handleScan().finally(() => {
            scanningLockRef.current = false;
            stableSinceRef.current = null;
            cooldownUntilRef.current = performance.now() + 800;
          });
        }
      } else {
        stableSinceRef.current = null;
        if (!loading) {
          setStatusText("Hold the label steady inside the frame…");
        }
      }
      rafRef.current = requestAnimationFrame(sample);
    };
    rafRef.current = requestAnimationFrame(sample);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastSmallFrameRef.current = null;
      stableSinceRef.current = null;
      scanningLockRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, loading, workerReady]);

  if (!open) return null;

  const sampleSmallFrame = (video: HTMLVideoElement): ImageData | null => {
    const { videoWidth, videoHeight } = video;
    if (!videoWidth || !videoHeight) return null;
    const roiWidth = videoWidth * ROI_WIDTH_RATIO;
    const roiHeight = videoHeight * ROI_HEIGHT_RATIO;
    const roiX = (videoWidth - roiWidth) / 2;
    const roiY = (videoHeight - roiHeight) / 2;
    const targetW = 200;
    const scale = targetW / roiWidth;
    const targetH = Math.max(1, Math.round(roiHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(
      video,
      roiX,
      roiY,
      roiWidth,
      roiHeight,
      0,
      0,
      targetW,
      targetH
    );
    return ctx.getImageData(0, 0, targetW, targetH);
  };

  const frameDiff = (a: ImageData, b: ImageData): number => {
    if (a.width !== b.width || a.height !== b.height) return Number.MAX_VALUE;
    const dataA = a.data;
    const dataB = b.data;
    let sum = 0;
    for (let i = 0; i < dataA.length; i += 4) {
      sum +=
        Math.abs(dataA[i] - dataB[i]) +
        Math.abs(dataA[i + 1] - dataB[i + 1]) +
        Math.abs(dataA[i + 2] - dataB[i + 2]);
    }
    return sum / (dataA.length / 4);
  };

  const playBeep = () => {
    try {
      if (!audioCtxRef.current) {
        const globalAudio = window as unknown as {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        };
        const Ctx = globalAudio.AudioContext || globalAudio.webkitAudioContext;
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(ctx.destination);
      const now = ctx.currentTime;
      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // ignore beep failures
    }
  };

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
        <p className="text-sm text-white/80">{statusText}</p>
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
          className="rounded-md bg-emerald-600 px-4 py-3 text-white disabled:bg-emerald-800"
          onClick={handleScan}
          disabled={loading || !workerReady}
        >
          {loading
            ? `${progressStatus}… ${Math.round(ocrProgress * 100)}%`
            : workerReady
              ? "Scan now"
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
