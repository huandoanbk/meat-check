"use client";

import { useEffect, useRef, useState } from "react";
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

const ROI_WIDTH_RATIO = 0.8;
const ROI_HEIGHT_RATIO = 0.25;
const MAX_UPLOAD_WIDTH = 800;

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

  useEffect(() => {
    if (!open) {
      cleanupStream();
      resetState();
      return;
    }
    startCamera();
    return () => cleanupStream();
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
        await videoRef.current.play();
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Không thể mở camera. Vui lòng kiểm tra quyền truy cập.";
      setError(message);
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
      const blob = await captureFrame(videoRef.current);
      const formData = new FormData();
      formData.append("image", blob, "scan.jpg");

      const res = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "OCR failed");
      }
      const data = await res.json();
      const text: string = data.text || "";
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
      const { videoWidth, videoHeight } = video;
      if (!videoWidth || !videoHeight) {
        reject(new Error("Camera chưa sẵn sàng."));
        return;
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
        reject(new Error("Canvas không khả dụng."));
        return;
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
          reject(new Error("Canvas không khả dụng."));
          return;
        }
        sctx.drawImage(cropCanvas, 0, 0, scaled.width, scaled.height);
        targetCanvas = scaled;
      }

      targetCanvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Không thể tạo ảnh."));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        0.8
      );
    });

  const handleConfirm = () => {
    const kg = parseFloat(kgInput);
    if (!selectedProductId) {
      setError("Vui lòng chọn sản phẩm.");
      return;
    }
    if (!Number.isFinite(kg) || kg <= 0 || kg < 0.05 || kg > 50) {
      setError("Khối lượng không hợp lệ (0.05 - 50 kg).");
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) {
      setError("Sản phẩm không hợp lệ.");
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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 text-white">
      <div className="relative h-full w-full">
        {mode === "camera" && (
          <>
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
            <div className="absolute inset-0 flex flex-col justify-between p-4">
              <div>
                <p className="text-sm text-white/80">
                  Đưa label vào khung rồi bấm Scan
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
                  disabled={loading}
                >
                  {loading ? "Đang đọc label…" : "Scan"}
                </button>
              </div>
            </div>
          </>
        )}

        {mode === "confirm" && (
          <div className="absolute inset-0 bg-gray-950 px-4 py-6 overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Xác nhận</h2>
              <div className="flex gap-2">
                <button
                  className="rounded-md bg-gray-800 px-3 py-2 text-sm"
                  onClick={() => {
                    clearConfirmState();
                    setError(null);
                    setMode("camera");
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
                <option value="">Chọn sản phẩm</option>
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
              Khối lượng (kg)
              <input
                type="number"
                step="0.001"
                inputMode="decimal"
                className="mt-1 w-full rounded-md bg-gray-800 px-3 py-2 text-white"
                value={kgInput}
                onChange={(e) => setKgInput(e.target.value)}
                placeholder="Nhập kg"
              />
            </label>

            <div className="mb-4">
              <button
                className="text-sm text-emerald-300 underline"
                onClick={() => setShowText((v) => !v)}
              >
                {showText ? "Ẩn OCR text" : "Xem OCR text"}
              </button>
              {showText && (
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-gray-900 px-3 py-2 text-xs whitespace-pre-wrap">
                  {ocrText || "(trống)"}
                </pre>
              )}
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 rounded-md bg-gray-800 px-4 py-3 text-white"
                onClick={() => setMode("camera")}
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
        )}
      </div>
    </div>
  );
}
