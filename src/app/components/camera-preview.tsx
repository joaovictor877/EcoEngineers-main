import { memo, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { API_URL } from "../lib/api";
import { socket } from "../lib/socket";

export type DevStatus = "conectado" | "desconectado" | "erro" | "ativo" | "inativo" | "ativa" | "inativa";

export const statusColor = (s: DevStatus) => {
  if (["conectado", "ativo", "ativa"].includes(s)) return "bg-green-50 text-green-700 border-green-200";
  if (s === "erro") return "bg-red-50 text-red-700 border-red-200";
  return "bg-gray-50 text-gray-500 border-gray-200";
};

export const statusDot = (s: DevStatus) => {
  if (["conectado", "ativo", "ativa"].includes(s)) return "bg-green-500 animate-pulse";
  if (s === "erro") return "bg-red-500";
  return "bg-gray-400";
};

const CAMERA_SNAPSHOT_DELAY_MS = 160;
const CAMERA_FRAME_DELAY_MS = 900;
const CAMERA_RETRY_DELAY_MS = 900;
const CAMERA_STALE_TIMEOUT_MS = 9000;
const CAMERA_STREAM_PATHS = ["video", "videofeed", "mjpeg"] as const;

export function normalizeCameraBase(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function makeCameraSnapshotSrc(cameraUrl: string) {
  const base = normalizeCameraBase(cameraUrl);
  const snapshotUrl = `${base}/photo.jpg`;
  const cacheBuster = `t=${Date.now()}`;

  if (base.startsWith("https://")) return `${snapshotUrl}?${cacheBuster}`;

  return `/api/cameras/proxy-stream?url=${encodeURIComponent(snapshotUrl)}&${cacheBuster}`;
}

function makeCameraStreamSrc(cameraUrl: string, path: string, nonce: number) {
  const base = normalizeCameraBase(cameraUrl);
  const streamUrl = `${base}/${path.replace(/^\/+/, "")}`;
  const cacheBuster = `t=${nonce}`;

  if (base.startsWith("https://")) return `${streamUrl}?${cacheBuster}`;

  return `/api/cameras/proxy-stream?url=${encodeURIComponent(streamUrl)}&${cacheBuster}`;
}

export const CameraPreview = memo(function CameraPreview({
  cameraUrl,
  onStatusChange,
}: {
  cameraUrl: string;
  onStatusChange: (status: DevStatus) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const staleTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const failedFramesRef = useRef(0);
  const lastToastRef = useRef(0);
  const onStatusChangeRef = useRef(onStatusChange);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    let isMounted = true;

    const clearTimers = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (staleTimerRef.current) window.clearTimeout(staleTimerRef.current);
      timerRef.current = null;
      staleTimerRef.current = null;
    };

    const scheduleNextFrame = (delay: number) => {
      clearTimers();
      timerRef.current = window.setTimeout(loadNextFrame, delay);
    };

    const markRetrying = () => {
      if (!isMounted) return;
      failedFramesRef.current += 1;
      setIsRetrying(true);
      onStatusChangeRef.current("erro");

      const now = Date.now();
      if (failedFramesRef.current >= 3 && now - lastToastRef.current > 12000) {
        toast.error("Sinal da câmera instável. Tentando reconectar...");
        lastToastRef.current = now;
      }

      scheduleNextFrame(CAMERA_RETRY_DELAY_MS);
    };

    const loadNextFrame = () => {
      if (!isMounted) return;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      staleTimerRef.current = window.setTimeout(() => {
        if (requestIdRef.current === requestId) markRetrying();
      }, CAMERA_STALE_TIMEOUT_MS);

      img.src = makeCameraSnapshotSrc(cameraUrl);
    };

    img.onload = () => {
      if (!isMounted) return;
      if (staleTimerRef.current) window.clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
      failedFramesRef.current = 0;
      setIsRetrying(false);
      onStatusChangeRef.current("ativa");
      scheduleNextFrame(CAMERA_FRAME_DELAY_MS);
    };

    img.onerror = markRetrying;

    setIsRetrying(false);
    onStatusChangeRef.current("ativa");
    loadNextFrame();

    return () => {
      isMounted = false;
      clearTimers();
      img.onload = null;
      img.onerror = null;
      img.removeAttribute("src");
    };
  }, [cameraUrl]);

  return (
    <div className="relative w-full h-full">
      <img
        ref={imgRef}
        alt="Camera feed"
        className="w-full h-full object-cover"
        decoding="async"
      />
      {isRetrying && (
        <div className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2 text-xs font-medium text-white">
          Reconectando câmera...
        </div>
      )}
    </div>
  );
});

export const FastCameraPreview = memo(function FastCameraPreview({
  cameraUrl,
  onStatusChange,
}: {
  cameraUrl: string;
  onStatusChange: (status: DevStatus) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const streamRetryRef = useRef<number | null>(null);
  const snapshotTimerRef = useRef<number | null>(null);
  const snapshotRetryRef = useRef<number | null>(null);
  const lastToastRef = useRef(0);
  const onStatusChangeRef = useRef(onStatusChange);
  const [streamPathIndex, setStreamPathIndex] = useState(0);
  const [streamNonce, setStreamNonce] = useState(Date.now());
  const [fallbackToSnapshots, setFallbackToSnapshots] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    setStreamPathIndex(0);
    setStreamNonce(Date.now());
    setFallbackToSnapshots(false);
    setIsRetrying(false);
    onStatusChangeRef.current("ativa");
  }, [cameraUrl]);

  useEffect(() => {
    if (fallbackToSnapshots) return;

    const img = imgRef.current;
    if (!img) return;

    if (streamRetryRef.current) window.clearTimeout(streamRetryRef.current);
    streamRetryRef.current = null;

    img.onload = () => {
      setIsRetrying(false);
      onStatusChangeRef.current("ativa");
    };

    img.onerror = () => {
      setIsRetrying(true);
      onStatusChangeRef.current("erro");

      if (streamPathIndex < CAMERA_STREAM_PATHS.length - 1) {
        streamRetryRef.current = window.setTimeout(() => {
          setStreamPathIndex((index) => index + 1);
          setStreamNonce(Date.now());
        }, CAMERA_RETRY_DELAY_MS);
        return;
      }

      const now = Date.now();
      if (now - lastToastRef.current > 12000) {
        toast.error("Stream da câmera falhou. Usando modo leve de emergência.");
        lastToastRef.current = now;
      }
      setFallbackToSnapshots(true);
    };

    img.src = makeCameraStreamSrc(cameraUrl, CAMERA_STREAM_PATHS[streamPathIndex], streamNonce);

    return () => {
      if (streamRetryRef.current) window.clearTimeout(streamRetryRef.current);
      streamRetryRef.current = null;
      img.onload = null;
      img.onerror = null;
    };
  }, [cameraUrl, fallbackToSnapshots, streamNonce, streamPathIndex]);

  useEffect(() => {
    if (!fallbackToSnapshots) return;

    const img = imgRef.current;
    if (!img) return;

    const clearSnapshotTimers = () => {
      if (snapshotTimerRef.current) window.clearTimeout(snapshotTimerRef.current);
      if (snapshotRetryRef.current) window.clearTimeout(snapshotRetryRef.current);
      snapshotTimerRef.current = null;
      snapshotRetryRef.current = null;
    };

    const loadNextSnapshot = () => {
      clearSnapshotTimers();
      img.src = makeCameraSnapshotSrc(cameraUrl);
    };

    img.onload = () => {
      setIsRetrying(true);
      onStatusChangeRef.current("ativa");
      snapshotTimerRef.current = window.setTimeout(loadNextSnapshot, CAMERA_SNAPSHOT_DELAY_MS);
    };

    img.onerror = () => {
      setIsRetrying(true);
      onStatusChangeRef.current("erro");
      snapshotRetryRef.current = window.setTimeout(loadNextSnapshot, CAMERA_RETRY_DELAY_MS);
    };

    loadNextSnapshot();

    return () => {
      clearSnapshotTimers();
      img.onload = null;
      img.onerror = null;
      img.removeAttribute("src");
    };
  }, [cameraUrl, fallbackToSnapshots]);

  return (
    <div className="relative w-full h-full bg-black">
      <img
        ref={imgRef}
        alt="Camera feed"
        className="w-full h-full object-cover transform-gpu will-change-transform [backface-visibility:hidden]"
        decoding="async"
        fetchPriority="high"
      />
      {isRetrying && (
        <div className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2 text-xs font-medium text-white">
          {fallbackToSnapshots ? "Modo leve de emergência" : "Reconectando câmera..."}
        </div>
      )}
    </div>
  );
});

const LIVE_RETRY_DELAY_MS = 2000;

/**
 * Preview ao vivo de uma câmera salva (por id), via GET /api/cameras/:id/live.
 * Funciona tanto para câmeras HTTP quanto RTSP (ex: Intelbras Mibo) — o
 * backend decide como converter o stream, o front só exibe um <img>
 * contínuo (multipart/x-mixed-replace).
 */
export const CameraLivePreview = memo(function CameraLivePreview({
  cameraId,
  onStatusChange,
}: {
  cameraId: number;
  onStatusChange?: (status: DevStatus) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  const [nonce, setNonce] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const token = localStorage.getItem("token") || "";
    const src = `${API_URL}/api/cameras/${cameraId}/live?token=${encodeURIComponent(token)}&s=${nonce}`;

    img.onload = () => {
      setIsRetrying(false);
      onStatusChangeRef.current?.("ativa");
    };
    img.onerror = () => {
      setIsRetrying(true);
      onStatusChangeRef.current?.("erro");
      retryTimerRef.current = window.setTimeout(() => setNonce((n) => n + 1), LIVE_RETRY_DELAY_MS);
    };
    img.src = src;

    return () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      img.onload = null;
      img.onerror = null;
      img.removeAttribute("src");
    };
  }, [cameraId, nonce]);

  return (
    <div className="relative w-full h-full bg-black">
      <img ref={imgRef} alt="Câmera ao vivo" className="w-full h-full object-cover" decoding="async" />
      {isRetrying && (
        <div className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2 text-xs font-medium text-white">
          Conectando à câmera...
        </div>
      )}
    </div>
  );
});

/**
 * Preview ao vivo no modo "push" — para quando o servidor NÃO consegue
 * alcançar a câmera diretamente (ex: servidor no Azure, câmera numa rede
 * local). Uma ponte local (scripts/bridge-camera-online.ps1) envia fotos
 * periódicas pro backend, que repassa por Socket.IO no evento
 * "camera_frame". Este componente só escuta esse evento e atualiza a imagem.
 */
export const CameraPushPreview = memo(function CameraPushPreview({
  cameraId,
  onStatusChange,
}: {
  cameraId: number;
  onStatusChange?: (status: DevStatus) => void;
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  const staleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    socket.connect();
    setImageSrc(null);
    onStatusChangeRef.current?.("inativa");

    const markStale = () => {
      onStatusChangeRef.current?.("erro");
    };
    const scheduleStale = () => {
      if (staleTimerRef.current) window.clearTimeout(staleTimerRef.current);
      // Sem frame novo por 10s = ponte local provavelmente parada.
      staleTimerRef.current = window.setTimeout(markStale, 10000);
    };

    const onFrame = (data: { camera_id: number; imagem_url: string; t: number }) => {
      if (data.camera_id !== cameraId) return;
      setImageSrc(`${API_URL}${data.imagem_url}?t=${data.t}`);
      onStatusChangeRef.current?.("ativa");
      scheduleStale();
    };

    socket.on("camera_frame", onFrame);

    return () => {
      socket.off("camera_frame", onFrame);
      if (staleTimerRef.current) window.clearTimeout(staleTimerRef.current);
      socket.disconnect();
    };
  }, [cameraId]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      {imageSrc ? (
        <img src={imageSrc} alt="Câmera ao vivo" className="w-full h-full object-cover" decoding="async" />
      ) : (
        <div className="text-center text-gray-400 p-6">
          <p className="text-sm">Aguardando a ponte local enviar a primeira foto...</p>
          <p className="text-xs mt-1 opacity-70">Rode scripts/bridge-camera-online.ps1 no PC da mesma rede da câmera.</p>
        </div>
      )}
    </div>
  );
});
