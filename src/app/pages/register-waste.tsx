import { memo, useState, useEffect, useRef } from "react";
import {
  Camera, Save, Wifi, Cpu, Activity, Brain,
  RefreshCw, CheckCircle, Zap, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";
import api, { API_URL } from "../lib/api";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  API_URL ||
  (import.meta.env.DEV ? "http://localhost:4000" : undefined);

type DevStatus = "conectado" | "desconectado" | "erro" | "ativo" | "inativo" | "ativa" | "inativa";

interface HWStatus {
  esp32: DevStatus;
  arduino: DevStatus;
  sensor: DevStatus;
  camera: DevStatus;
}

interface AIResult {
  material_detectado: string;
  categoria_detectada: string;
  confianca: number;
  observacao: string;
  sugestao_destino: string;
  analise_id?: number;
  imagem_url?: string;
}

const statusColor = (s: DevStatus) => {
  if (["conectado", "ativo", "ativa"].includes(s)) return "bg-green-50 text-green-700 border-green-200";
  if (s === "erro") return "bg-red-50 text-red-700 border-red-200";
  return "bg-gray-50 text-gray-500 border-gray-200";
};

const statusDot = (s: DevStatus) => {
  if (["conectado", "ativo", "ativa"].includes(s)) return "bg-green-500 animate-pulse";
  if (s === "erro") return "bg-red-500";
  return "bg-gray-400";
};

const DESTINO_LABEL: Record<string, string> = {
  reaproveitamento: "Reaproveitamento Interno",
  reciclagem: "Reciclagem Externa",
  descarte: "Descarte Controlado",
  venda: "Venda para Terceiros",
};

const CAMERA_SNAPSHOT_DELAY_MS = 160;
const CAMERA_FRAME_DELAY_MS = 900;
const CAMERA_RETRY_DELAY_MS = 900;
const CAMERA_STALE_TIMEOUT_MS = 9000;
const CAMERA_STREAM_PATHS = ["video", "videofeed", "mjpeg"] as const;

function normalizeCameraBase(url: string) {
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

interface Material {
  id: number;
  name: string;
  category: string;
  unit: string;
}

const CameraPreview = memo(function CameraPreview({
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

const FastCameraPreview = memo(function FastCameraPreview({
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

export function RegisterWaste() {
  const [formData, setFormData] = useState({
    material_id: "",
    materialType: "",
    category: "",
    weight: "",
    department: "",
    date: new Date().toISOString().split("T")[0],
    destination: "",
    observation: "",
  });

  const [materialsList, setMaterialsList] = useState<Material[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [hwStatus, setHwStatus] = useState<HWStatus>({
    esp32: "desconectado",
    arduino: "desconectado",
    sensor: "inativo",
    camera: "inativa",
  });

  const [cameraUrl, setCameraUrl] = useState(
    import.meta.env.VITE_CAMERA_URL || "https://camera.joaovictor.app.br"
  );
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraSession, setCameraSession] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDetectedByAI, setIsDetectedByAI] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const weightConnectionNotifiedRef = useRef(false);

  const getApiErrorMessage = (error: any, fallback: string) => {
    const serverMessage = error?.response?.data?.error;
    if (typeof serverMessage === "string" && serverMessage.trim()) return serverMessage;
    return fallback;
  };

  const formatWeightKg = (peso: number) =>
    peso.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  const parseWeightKg = (peso: string) => Number(peso.replace(",", "."));

  // ── Socket.IO ──────────────────────────────────────────────
  useEffect(() => {
    socketRef.current = io(SOCKET_URL, { transports: ["websocket", "polling"] });

    socketRef.current.on("peso_atualizado", (data: { peso: number; dispositivo: string }) => {
      const peso = Number(data.peso);
      if (!Number.isFinite(peso)) return;

<<<<<<< HEAD
      const formattedWeight = formatWeightKg(peso);
=======
      const formattedWeight = peso.toFixed(3);
>>>>>>> 9c6a02bfa97a97e01f55332e02d03056163e17a4
      setFormData((prev) => (
        prev.weight === formattedWeight ? prev : { ...prev, weight: formattedWeight }
      ));
      setHwStatus((prev) => ({ ...prev, arduino: "conectado", sensor: "ativo" }));

      if (!weightConnectionNotifiedRef.current) {
        toast.success(`Arduino e HX711 ativos — peso inicial: ${formattedWeight} kg`);
        weightConnectionNotifiedRef.current = true;
      }
    });

    socketRef.current.on("analise_ia_concluida", (data: AIResult) => {
      applyAIResult(data);
    });

    socketRef.current.on("dispositivo_atualizado", (dev: { tipo: string; status: DevStatus }) => {
      if (dev.tipo === "esp32") setHwStatus((p) => ({ ...p, esp32: dev.status }));
      else if (dev.tipo === "arduino_uno") setHwStatus((p) => ({ ...p, arduino: dev.status }));
    });

    return () => { socketRef.current?.disconnect(); };
  }, []);

  // Load materials list
  useEffect(() => {
    api.get<Material[]>("/api/materials")
      .then((r) => setMaterialsList(r.data))
      .catch(() => toast.error("Falha ao carregar lista de materiais"));
  }, []);

  function applyAIResult(data: AIResult) {
    setAiResult(data);
    setIsAnalyzing(false);
    setIsDetectedByAI(true);
    const destLabel = DESTINO_LABEL[data.sugestao_destino] ? data.sugestao_destino : "";
    // Try to match AI detected material name to one in the list
    const aiName = (data.material_detectado || "").toLowerCase();
    const match = materialsList.find(
      (m) => m.name.toLowerCase() === aiName ||
             m.name.toLowerCase().includes(aiName) ||
             aiName.includes(m.name.toLowerCase())
    );
    setFormData((prev) => ({
      ...prev,
      material_id: match ? String(match.id) : "",
      materialType: data.material_detectado,
      category: data.categoria_detectada,
      destination: destLabel || prev.destination,
      observation: data.observacao,
    }));
    if (data.imagem_url) setCapturedImage(`${API_URL}${data.imagem_url}`);
    toast.success(`🤖 IA: ${data.material_detectado} — ${data.confianca.toFixed(1)}% confiança`);
  }

  const conectarHardware = () => {
    setHwStatus((p) => ({ ...p, esp32: "conectado", arduino: "conectado", sensor: "ativo" }));
    toast.success("✅ Hardware ESP32 + Arduino conectados!");
  };

  const conectarCamera = () => {
    const normalizedUrl = normalizeCameraBase(cameraUrl);
    if (!normalizedUrl) { toast.error("Informe a URL da câmera"); return; }
    setCameraUrl(normalizedUrl);
    setCameraActive(true);
    setCameraSession((session) => session + 1);
    setHwStatus((p) => ({ ...p, camera: "ativa" }));
    toast.success("📷 Câmera IP conectada!");
  };

  const capturarEAnalisar = async () => {
    if (!cameraUrl.trim()) { toast.error("Configure a URL da câmera primeiro"); return; }
    setIsAnalyzing(true);
    toast.info("📸 Capturando frame e analisando...");
    try {
      const { data } = await api.post<AIResult>("/api/ia/capturar-camera", { camera_url: cameraUrl });
      applyAIResult(data);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Falha ao capturar imagem da câmera. Verifique a URL."));
      setIsAnalyzing(false);
    }
  };

  const analisarSemImagem = async () => {
    setIsAnalyzing(true);
    toast.info("🔍 Analisando com IA...");
    try {
      const formPayload = new FormData();
      const { data } = await api.post<AIResult>("/api/ia/analisar", formPayload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      applyAIResult(data);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Falha na análise de IA"));
      setIsAnalyzing(false);
    }
  };

  const handleUploadImagem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsAnalyzing(true);
    toast.info("🖼️ Analisando imagem enviada...");
    const formPayload = new FormData();
    formPayload.append("imagem", file);
    try {
      const { data } = await api.post<AIResult>("/api/ia/analisar", formPayload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      applyAIResult(data);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Falha na análise"));
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pesoKg = parseWeightKg(formData.weight);
    if (!formData.material_id) { toast.error("Selecione o tipo de material"); return; }
    if (!formData.weight || !Number.isFinite(pesoKg) || pesoKg <= 0) { toast.error("Informe o peso corretamente"); return; }
    if (!formData.department) { toast.error("Selecione o setor de origem"); return; }
    if (!formData.destination) { toast.error("Selecione o destino"); return; }
    setIsSubmitting(true);
    try {
      await api.post("/api/residuos", {
        material_id: Number(formData.material_id),
        peso: pesoKg,
        setor_origem: formData.department,
        destino: formData.destination,
        observacao: formData.observation,
        analise_ia_id: aiResult?.analise_id || null,
      });
      toast.success("✅ Resíduo registrado com sucesso!");
      setFormData({
        material_id: "", materialType: "", category: "", weight: "",
        department: "", date: new Date().toISOString().split("T")[0],
        destination: "", observation: "",
      });
      setAiResult(null);
      setIsDetectedByAI(false);
      setCapturedImage(null);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Falha ao registrar resíduo"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = (highlighted = false) =>
    `w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all ${
      highlighted
        ? "border-[#2E7D32] bg-green-50"
        : "bg-[#F5F5F5] border-transparent focus:border-[#2E7D32]"
    }`;

  const hwItems: { label: string; icon: React.ElementType; key: keyof HWStatus }[] = [
    { label: "ESP32",          icon: Cpu,      key: "esp32"   },
    { label: "Arduino",        icon: Zap,      key: "arduino" },
    { label: "Sensor de Peso", icon: Activity, key: "sensor"  },
    { label: "Câmera IP",      icon: Camera,   key: "camera"  },
  ];

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-[#424242] mb-1">
          Registro de Resíduos
        </h1>
        <p className="text-[#717182]">
          Identificação automática por IA · ESP32 + Arduino · Câmera IP
        </p>
      </div>

      {/* Hardware Status Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {hwItems.map(({ label, icon: Icon, key }) => (
          <div
            key={key}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${statusColor(hwStatus[key])}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot(hwStatus[key])}`} />
            <Icon className="w-4 h-4 flex-shrink-0 opacity-70" />
            <div>
              <div className="text-xs font-semibold">{label}</div>
              <div className="text-xs capitalize opacity-80">{hwStatus[key]}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT: Câmera + IA ── */}
        <div className="space-y-4">

          {/* Camera Feed */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-[#424242] flex items-center gap-2 text-sm">
                <Camera className="w-4 h-4 text-[#2E7D32]" /> Câmera IP
              </h3>
              {hwStatus.camera === "ativa" && (
                <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> AO VIVO
                </span>
              )}
            </div>
            <div className="aspect-video bg-gray-900 flex items-center justify-center overflow-hidden">
              {cameraActive ? (
                <FastCameraPreview
                  key={`${cameraUrl}-${cameraSession}`}
                  cameraUrl={cameraUrl}
                  onStatusChange={(status) => setHwStatus((p) => (
                    p.camera === status ? p : { ...p, camera: status }
                  ))}
                />
              ) : capturedImage ? (
                <img src={capturedImage} alt="Captura IA" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center text-gray-500 p-6">
                  <Camera className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Câmera desconectada</p>
                  <p className="text-xs mt-1 opacity-60">Configure a URL e clique em Conectar</p>
                </div>
              )}
            </div>
            <div className="p-4 space-y-2">
              <input
                type="text"
                value={cameraUrl}
                onChange={(e) => setCameraUrl(e.target.value)}
                placeholder="https://camera.joaovictor.app.br"
                className="w-full text-sm px-3 py-2 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none transition-all"
              />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={conectarCamera} className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1">
                  <Wifi className="w-3.5 h-3.5" /> Conectar
                </button>
                <button onClick={capturarEAnalisar} disabled={isAnalyzing} className="bg-[#F5F5F5] hover:bg-[#E0E0E0] text-[#424242] py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 disabled:opacity-50">
                  <Camera className="w-3.5 h-3.5" /> Capturar
                </button>
              </div>
            </div>
          </div>

          {/* AI Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-[#424242] flex items-center gap-2 text-sm">
                <Brain className="w-4 h-4 text-[#2E7D32]" /> Análise por IA
              </h3>
              {aiResult && (
                <span className="text-xs bg-[#2E7D32] text-white px-2 py-0.5 rounded-full font-medium">🤖 Detectado</span>
              )}
            </div>
            <div className="p-4">
              {aiResult ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#424242]">{aiResult.material_detectado}</span>
                    <span className="text-sm font-bold text-[#2E7D32]">{aiResult.confianca.toFixed(1)}%</span>
                  </div>
                  <div className="text-xs text-[#717182]">{aiResult.categoria_detectada}</div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-[#2E7D32] h-1.5 rounded-full transition-all duration-700" style={{ width: `${aiResult.confianca}%` }} />
                  </div>
                  <p className="text-xs text-[#717182] leading-relaxed">{aiResult.observacao}</p>
                  <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <CheckCircle className="w-3 h-3" /> Formulário preenchido automaticamente
                  </div>
                </div>
              ) : isAnalyzing ? (
                <div className="text-center py-5">
                  <RefreshCw className="w-8 h-8 text-[#2E7D32] animate-spin mx-auto mb-2" />
                  <p className="text-sm text-[#717182]">Analisando material...</p>
                </div>
              ) : (
                <div className="text-center py-5">
                  <Brain className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-[#717182]">Capture uma imagem ou clique em Analisar</p>
                </div>
              )}
              <div className="space-y-2 mt-3">
                <button onClick={analisarSemImagem} disabled={isAnalyzing} className="w-full bg-gradient-to-r from-[#2E7D32] to-[#66BB6A] hover:from-[#1B5E20] hover:to-[#4CAF50] text-white py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-60 text-sm">
                  {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                  {isAnalyzing ? "Analisando..." : "Analisar Material"}
                </button>
                <label className="w-full cursor-pointer bg-[#F5F5F5] hover:bg-[#E8F5E9] text-[#424242] py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm border border-dashed border-gray-300 hover:border-[#2E7D32]">
                  <Camera className="w-4 h-4" /> Enviar Imagem
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadImagem} />
                </label>
              </div>
            </div>
          </div>

          {/* Hardware Connect */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-semibold text-[#424242] mb-3 flex items-center gap-2 text-sm">
              <Cpu className="w-4 h-4 text-[#2E7D32]" /> Conectar Hardware
            </h3>
            <button onClick={conectarHardware} className="w-full bg-[#66BB6A] hover:bg-[#4CAF50] text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm">
              <Wifi className="w-4 h-4" /> Conectar ESP32 + Arduino
            </button>
            <p className="text-xs text-[#717182] mt-2 text-center">
              Peso do sensor será preenchido automaticamente via WebSocket
            </p>
          </div>
        </div>

        {/* ── RIGHT: Form ── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:p-8">
            {isDetectedByAI && (
              <div className="mb-5 px-4 py-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-700">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-medium">Formulário preenchido automaticamente pela IA</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-2">
                    Tipo de Material
                    {isDetectedByAI && <span className="ml-2 text-xs bg-[#2E7D32] text-white px-1.5 py-0.5 rounded font-normal">IA</span>}
                  </label>
                  <select
                    value={formData.material_id}
                    onChange={(e) => {
                      const mat = materialsList.find((m) => String(m.id) === e.target.value);
                      setFormData((prev) => ({
                        ...prev,
                        material_id: e.target.value,
                        materialType: mat?.name || "",
                        category: mat?.category || prev.category,
                      }));
                    }}
                    className={inputClass(isDetectedByAI)}
                    required
                  >
                    <option value="">Selecione o material</option>
                    {materialsList.map((m) => (
                      <option key={m.id} value={String(m.id)}>{m.name}</option>
                    ))}
                  </select>
                  {isDetectedByAI && !formData.material_id && (
                    <p className="text-xs text-amber-600 mt-1">⚠️ IA detectou "{formData.materialType}" — selecione o material equivalente acima</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-2">
                    Categoria
                    {isDetectedByAI && <span className="ml-2 text-xs bg-[#2E7D32] text-white px-1.5 py-0.5 rounded font-normal">IA</span>}
                  </label>
                  <input type="text" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className={inputClass(isDetectedByAI)} placeholder="Ex: Metal Não Ferroso" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#424242] mb-2">
                  Peso (kg)
                  {hwStatus.sensor === "ativo" && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-normal">Auto — Sensor HX711</span>}
                </label>
<<<<<<< HEAD
                <input type="text" inputMode="decimal" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value.replace(".", ",") })} className={inputClass(hwStatus.sensor === "ativo")} placeholder="0,000" required />
=======
                <input type="number" step="0.001" min="0" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} className={inputClass(hwStatus.sensor === "ativo")} placeholder="0.000" required />
>>>>>>> 9c6a02bfa97a97e01f55332e02d03056163e17a4
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-2">Setor de Origem</label>
                  <select value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} className={inputClass()} required>
                    <option value="">Selecione o setor</option>
                    <option value="producao">Produção</option>
                    <option value="montagem">Montagem</option>
                    <option value="estamparia">Estamparia</option>
                    <option value="pintura">Pintura</option>
                    <option value="usinagem">Usinagem</option>
                    <option value="manutencao">Manutenção</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-2">
                    Destino
                    {isDetectedByAI && <span className="ml-2 text-xs bg-[#2E7D32] text-white px-1.5 py-0.5 rounded font-normal">IA</span>}
                  </label>
                  <select value={formData.destination} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} className={inputClass(isDetectedByAI)} required>
                    <option value="">Selecione o destino</option>
                    <option value="reaproveitamento">Reaproveitamento Interno</option>
                    <option value="reciclagem">Reciclagem Externa</option>
                    <option value="descarte">Descarte Controlado</option>
                    <option value="venda">Venda para Terceiros</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#424242] mb-2">Data</label>
                <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className={inputClass()} required />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#424242] mb-2">
                  Observação
                  {isDetectedByAI && <span className="ml-2 text-xs bg-[#2E7D32] text-white px-1.5 py-0.5 rounded font-normal">IA</span>}
                </label>
                <textarea value={formData.observation} onChange={(e) => setFormData({ ...formData, observation: e.target.value })} className={`${inputClass(isDetectedByAI)} resize-none`} rows={3} placeholder="Observações adicionais sobre o material..." />
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full bg-[#2E7D32] hover:bg-[#1B5E20] text-white py-3.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-base disabled:opacity-60 disabled:cursor-not-allowed">
                {isSubmitting ? (
                  <><RefreshCw className="w-5 h-5 animate-spin" /> Registrando...</>
                ) : (
                  <><Save className="w-5 h-5" /> Registrar Material</>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
