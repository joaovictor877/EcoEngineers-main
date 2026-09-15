import { useEffect, useRef, useState } from "react";
import {
  Camera, Wifi, Activity, QrCode, ScanLine, RefreshCw,
  CheckCircle2, XCircle, PackageSearch, Cpu, Zap,
} from "lucide-react";
import { toast } from "sonner";
import api, { API_URL } from "../lib/api";
import { socket } from "../lib/socket";
import {
  CameraPreview, statusColor, statusDot, normalizeCameraBase,
} from "../components/camera-preview";
import type { DevStatus } from "../components/camera-preview";

interface Posto {
  id: number;
  nome: string;
  localizacao: string | null;
}

interface Validacao {
  id: number;
  resultado: "aprovado" | "reprovado";
  motivo_divergencia: string | null;
  peso_medido: number | null;
  qrcode_lido: string | null;
  produto_nome: string | null;
  produto_sku: string | null;
  imagem_url: string | null;
  criado_em: string;
  ia?: { material_detectado?: string; confianca?: number };
}

const formatWeightKg = (peso: number) =>
  peso.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

interface HWStatus {
  esp32: DevStatus;
  arduino: DevStatus;
  sensor: DevStatus;
  camera: DevStatus;
}

export function ValidationStation() {
  const [hwStatus, setHwStatus] = useState<HWStatus>({
    esp32: "desconectado",
    arduino: "desconectado",
    sensor: "inativo",
    camera: "inativa",
  });

  const [focusedPanel, setFocusedPanel] = useState<"camera" | "balanca">("camera");

  const [cameraUrl, setCameraUrl] = useState(
    import.meta.env.VITE_CAMERA_URL || "https://camera.joaovictor.app.br"
  );
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraSession, setCameraSession] = useState(0);

  const [peso, setPeso] = useState("");
  const [postos, setPostos] = useState<Posto[]>([]);
  const [postoId, setPostoId] = useState("");

  const [isValidating, setIsValidating] = useState(false);
  const [resultado, setResultado] = useState<Validacao | null>(null);
  const [historico, setHistorico] = useState<Validacao[]>([]);

  const weightNotifiedRef = useRef(false);

  useEffect(() => {
    socket.connect();

    const onPeso = (data: { peso: number }) => {
      const p = Number(data.peso);
      if (!Number.isFinite(p)) return;
      setPeso(formatWeightKg(p));
      setHwStatus((prev) => ({ ...prev, arduino: "conectado", sensor: "ativo" }));
      if (!weightNotifiedRef.current) {
        toast.success(`Balança ativa — peso inicial: ${formatWeightKg(p)} kg`);
        weightNotifiedRef.current = true;
      }
    };

    const onValidacao = (data: Validacao) => {
      setHistorico((prev) => [data, ...prev].slice(0, 20));
    };

    const onDispositivo = (dev: { tipo: string; status: DevStatus }) => {
      if (dev.tipo === "esp32") setHwStatus((p) => ({ ...p, esp32: dev.status }));
      else if (dev.tipo === "arduino_uno") setHwStatus((p) => ({ ...p, arduino: dev.status }));
    };

    socket.on("peso_atualizado", onPeso);
    socket.on("validacao_concluida", onValidacao);
    socket.on("dispositivo_atualizado", onDispositivo);

    return () => {
      socket.off("peso_atualizado", onPeso);
      socket.off("validacao_concluida", onValidacao);
      socket.off("dispositivo_atualizado", onDispositivo);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    api.get<Posto[]>("/api/validacoes/postos")
      .then((r) => {
        setPostos(r.data);
        if (r.data[0]) setPostoId(String(r.data[0].id));
      })
      .catch(() => toast.error("Falha ao carregar postos de validação"));

    api.get<Validacao[]>("/api/validacoes")
      .then((r) => setHistorico(r.data.slice(0, 20)))
      .catch(() => toast.error("Falha ao carregar histórico de validações"));
  }, []);

  const conectarCamera = () => {
    const normalized = normalizeCameraBase(cameraUrl);
    if (!normalized) { toast.error("Informe a URL da câmera"); return; }
    setCameraUrl(normalized);
    setCameraActive(true);
    setCameraSession((s) => s + 1);
    setHwStatus((p) => ({ ...p, camera: "ativa" }));
    toast.success("📷 Câmera conectada!");
  };

  const conectarHardware = () => {
    setHwStatus((p) => ({ ...p, esp32: "conectado", arduino: "conectado", sensor: "ativo" }));
    toast.success("✅ Hardware ESP32 + Arduino conectados!");
  };

  const getApiErrorMessage = (error: any, fallback: string) =>
    (typeof error?.response?.data?.error === "string" && error.response.data.error.trim()) || fallback;

  const validarItem = async () => {
    if (!cameraUrl.trim()) { toast.error("Configure a URL da câmera primeiro"); return; }
    const pesoNum = Number(peso.replace(",", "."));
    if (!peso || !Number.isFinite(pesoNum) || pesoNum <= 0) { toast.error("Informe o peso medido"); return; }

    setIsValidating(true);
    setResultado(null);
    toast.info("🔍 Capturando imagem, lendo QR e verificando peso...");
    try {
      const { data } = await api.post<Validacao>("/api/validacoes", {
        camera_url: cameraUrl,
        peso_medido: pesoNum,
        posto_id: postoId || null,
      });
      setResultado(data);
      if (data.resultado === "aprovado") toast.success("✅ Item aprovado para expedição!");
      else toast.error("❌ Item reprovado — verifique o motivo abaixo.");
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Falha ao validar item"));
    } finally {
      setIsValidating(false);
    }
  };

  const hwItems: { label: string; icon: React.ElementType; key: keyof HWStatus }[] = [
    { label: "ESP32",   icon: Cpu,      key: "esp32"   },
    { label: "Arduino", icon: Zap,      key: "arduino" },
    { label: "Balança", icon: Activity, key: "sensor"  },
    { label: "Câmera",  icon: Camera,   key: "camera"  },
  ];

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-[#424242] mb-1">Posto de Validação</h1>
        <p className="text-[#717182]">Câmera + balança + QR Code — confronto antes da expedição</p>
      </div>

      {/* Hardware status — sempre visível, independente do painel em foco */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {hwItems.map(({ label, icon: Icon, key }) => (
          <div key={key} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${statusColor(hwStatus[key])}`}>
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot(hwStatus[key])}`} />
            <Icon className="w-4 h-4 flex-shrink-0 opacity-70" />
            <div>
              <div className="text-xs font-semibold">{label}</div>
              <div className="text-xs capitalize opacity-80">{hwStatus[key]}</div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={conectarHardware} className="mb-6 bg-[#66BB6A] hover:bg-[#4CAF50] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
        <Wifi className="w-4 h-4" /> Conectar ESP32 + Arduino
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: camera + balança, alternando com um clique */}
        <div className="space-y-4">
          {/* Troca fluida entre os dois painéis */}
          <div className="flex gap-2 bg-white rounded-xl border border-gray-100 p-1.5">
            <button
              onClick={() => setFocusedPanel("camera")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                focusedPanel === "camera" ? "bg-[#2E7D32] text-white" : "text-[#717182] hover:bg-gray-50"
              }`}
            >
              <Camera className="w-4 h-4" /> Câmera
            </button>
            <button
              onClick={() => setFocusedPanel("balanca")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                focusedPanel === "balanca" ? "bg-[#2E7D32] text-white" : "text-[#717182] hover:bg-gray-50"
              }`}
            >
              <Activity className="w-4 h-4" /> Balança
            </button>
          </div>

          {focusedPanel === "camera" ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-[#424242] flex items-center gap-2 text-sm">
                  <Camera className="w-4 h-4 text-[#2E7D32]" /> Câmera do Posto
                </h3>
                {hwStatus.camera === "ativa" && (
                  <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> AO VIVO
                  </span>
                )}
              </div>
              <div className="aspect-video bg-gray-900 flex items-center justify-center overflow-hidden">
                {cameraActive ? (
                  <CameraPreview
                    key={`${cameraUrl}-${cameraSession}`}
                    cameraUrl={cameraUrl}
                    onStatusChange={(status) => setHwStatus((p) => (p.camera === status ? p : { ...p, camera: status }))}
                  />
                ) : (
                  <div className="text-center text-gray-500 p-6">
                    <Camera className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Câmera desconectada</p>
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
                <button onClick={conectarCamera} className="w-full bg-[#2E7D32] hover:bg-[#1B5E20] text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1">
                  <Wifi className="w-3.5 h-3.5" /> Conectar Câmera
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setFocusedPanel("camera")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${statusColor(hwStatus.camera)} hover:opacity-80`}
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot(hwStatus.camera)}`} />
              <Camera className="w-4 h-4 flex-shrink-0 opacity-70" />
              <div className="flex-1">
                <div className="text-xs font-semibold">Câmera do Posto</div>
                <div className="text-xs capitalize opacity-80">{hwStatus.camera}</div>
              </div>
              <span className="text-xs opacity-60">ver →</span>
            </button>
          )}

          {focusedPanel === "balanca" ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
              <h3 className="font-semibold text-[#424242] flex items-center gap-2 text-sm">
                <Activity className="w-4 h-4 text-[#2E7D32]" /> Peso Medido (kg)
                {hwStatus.sensor === "ativo" && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-normal">Auto</span>}
              </h3>
              <input
                type="text" inputMode="decimal" value={peso}
                onChange={(e) => setPeso(e.target.value.replace(".", ","))}
                placeholder="0,000"
                className="w-full px-4 py-3 rounded-lg border border-transparent bg-[#F5F5F5] focus:border-[#2E7D32] focus:outline-none transition-all"
              />
            </div>
          ) : (
            <button
              onClick={() => setFocusedPanel("balanca")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${statusColor(hwStatus.sensor)} hover:opacity-80`}
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot(hwStatus.sensor)}`} />
              <Activity className="w-4 h-4 flex-shrink-0 opacity-70" />
              <div className="flex-1">
                <div className="text-xs font-semibold">Peso Medido</div>
                <div className="text-xs opacity-80">{peso ? `${peso} kg` : hwStatus.sensor}</div>
              </div>
              <span className="text-xs opacity-60">ver →</span>
            </button>
          )}

          {/* Ação principal — sempre visível, não depende do painel em foco */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
            {postos.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-[#717182] mb-1">Posto</label>
                <select value={postoId} onChange={(e) => setPostoId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-transparent bg-[#F5F5F5] focus:border-[#2E7D32] focus:outline-none text-sm">
                  {postos.map((p) => <option key={p.id} value={String(p.id)}>{p.nome}</option>)}
                </select>
              </div>
            )}

            <button
              onClick={validarItem}
              disabled={isValidating}
              className="w-full bg-gradient-to-r from-[#2E7D32] to-[#66BB6A] hover:from-[#1B5E20] hover:to-[#4CAF50] text-white py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isValidating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
              {isValidating ? "Validando..." : "Capturar e Validar"}
            </button>
          </div>
        </div>

        {/* RIGHT: verdict + history */}
        <div className="lg:col-span-2 space-y-4">
          {resultado ? (
            <div className={`rounded-xl border p-6 ${resultado.resultado === "aprovado" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <div className="flex items-center gap-3 mb-4">
                {resultado.resultado === "aprovado" ? (
                  <CheckCircle2 className="w-10 h-10 text-green-600 flex-shrink-0" />
                ) : (
                  <XCircle className="w-10 h-10 text-red-600 flex-shrink-0" />
                )}
                <div>
                  <p className={`text-xl font-bold ${resultado.resultado === "aprovado" ? "text-green-700" : "text-red-700"}`}>
                    {resultado.resultado === "aprovado" ? "Aprovado para expedição" : "Reprovado — não expedir"}
                  </p>
                  {resultado.motivo_divergencia && (
                    <p className="text-sm text-[#717182] mt-0.5">{resultado.motivo_divergencia}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-[#717182] flex items-center gap-1"><PackageSearch className="w-3 h-3" /> Produto</p>
                  <p className="font-semibold text-[#424242]">{resultado.produto_nome || "Não identificado"}</p>
                  {resultado.produto_sku && <p className="text-xs text-[#717182]">{resultado.produto_sku}</p>}
                </div>
                <div>
                  <p className="text-xs text-[#717182] flex items-center gap-1"><QrCode className="w-3 h-3" /> QR Lido</p>
                  <p className="font-mono text-xs text-[#424242] break-all">{resultado.qrcode_lido || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-[#717182]">Peso Medido</p>
                  <p className="font-semibold text-[#424242]">{resultado.peso_medido?.toFixed(3)} kg</p>
                </div>
                <div>
                  <p className="text-xs text-[#717182]">IA (referência)</p>
                  <p className="text-[#424242]">{resultado.ia?.material_detectado || "—"}</p>
                </div>
              </div>
              {resultado.imagem_url && (
                <img src={`${API_URL}${resultado.imagem_url}`} alt="Captura" className="mt-4 rounded-lg max-h-64 object-cover" />
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-[#717182]">
              <ScanLine className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Conecte a câmera, informe o peso e clique em "Capturar e Validar".</p>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-[#424242] text-sm">Últimas Validações</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F5F5F5]">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-[#424242]">Produto</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#424242]">Peso</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#424242]">Resultado</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#424242]">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historico.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-[#717182]">Nenhuma validação registrada ainda.</td></tr>
                  ) : historico.map((v) => (
                    <tr key={v.id}>
                      <td className="px-4 py-2 text-[#424242]">{v.produto_nome || "—"}</td>
                      <td className="px-4 py-2 text-[#424242]">{v.peso_medido?.toFixed(3) ?? "—"} kg</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${v.resultado === "aprovado" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {v.resultado === "aprovado" ? "Aprovado" : "Reprovado"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[#717182]">{new Date(v.criado_em).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
