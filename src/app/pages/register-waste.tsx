import { useState, useEffect, useRef } from "react";
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

export function RegisterWaste() {
  const [formData, setFormData] = useState({
    materialType: "",
    category: "",
    weight: "",
    department: "",
    date: new Date().toISOString().split("T")[0],
    destination: "",
    observation: "",
  });

  const [hwStatus, setHwStatus] = useState<HWStatus>({
    esp32: "desconectado",
    arduino: "desconectado",
    sensor: "inativo",
    camera: "inativa",
  });

  const [cameraUrl, setCameraUrl] = useState(
    import.meta.env.VITE_CAMERA_URL || "http://192.168.1.120:8080"
  );
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDetectedByAI, setIsDetectedByAI] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const getApiErrorMessage = (error: any, fallback: string) => {
    const serverMessage = error?.response?.data?.error;
    if (typeof serverMessage === "string" && serverMessage.trim()) return serverMessage;
    return fallback;
  };

  // ── Socket.IO ──────────────────────────────────────────────
  useEffect(() => {
    socketRef.current = io(SOCKET_URL, { transports: ["websocket", "polling"] });

    socketRef.current.on("peso_atualizado", (data: { peso: number; dispositivo: string }) => {
      setFormData((prev) => ({ ...prev, weight: String(data.peso) }));
      setHwStatus((prev) => ({ ...prev, esp32: "conectado", sensor: "ativo" }));
      toast.success(`⚖️ Peso recebido: ${data.peso} kg — ${data.dispositivo}`);
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

  function applyAIResult(data: AIResult) {
    setAiResult(data);
    setIsAnalyzing(false);
    setIsDetectedByAI(true);
    const destLabel = DESTINO_LABEL[data.sugestao_destino] ? data.sugestao_destino : "";
    setFormData((prev) => ({
      ...prev,
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
    if (!cameraUrl.trim()) { toast.error("Informe a URL da câmera"); return; }
    setCameraActive(true);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("✅ Material registrado com sucesso!");
    setFormData({
      materialType: "", category: "", weight: "",
      department: "", date: new Date().toISOString().split("T")[0],
      destination: "", observation: "",
    });
    setAiResult(null);
    setIsDetectedByAI(false);
    setCapturedImage(null);
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
                <img
                  src={`${cameraUrl}/video`}
                  alt="Camera feed"
                  className="w-full h-full object-cover"
                  onError={() => { setCameraActive(false); toast.error("Falha na câmera"); }}
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
                placeholder="http://192.168.1.120:8080"
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
                  <input type="text" value={formData.materialType} onChange={(e) => setFormData({ ...formData, materialType: e.target.value })} className={inputClass(isDetectedByAI)} placeholder="Ex: Cavaco de Alumínio" required />
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
                <input type="number" step="0.01" min="0" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} className={inputClass(hwStatus.sensor === "ativo")} placeholder="0.00" required />
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

              <button type="submit" className="w-full bg-[#2E7D32] hover:bg-[#1B5E20] text-white py-3.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-base">
                <Save className="w-5 h-5" /> Registrar Material
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}


