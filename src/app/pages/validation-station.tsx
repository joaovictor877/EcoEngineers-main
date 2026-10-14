import { useEffect, useRef, useState } from "react";
import {
  Camera, Wifi, Activity, QrCode, ScanLine, RefreshCw,
  CheckCircle2, XCircle, PackageSearch, Cpu, Zap, Scale, Image as ImageIcon,
  AlertTriangle, MinusCircle, Radio, Lock, Unlock,
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
  linha?: string | null;
  codigo?: string | null;
}

type Criterio = "ok" | "falhou" | "nao_verificado";

interface Validacao {
  id: number;
  resultado: "aprovado" | "reprovado";
  motivo_divergencia: string | null;
  peso_medido: number | string | null;
  qrcode_lido: string | null;
  produto_nome: string | null;
  produto_sku: string | null;
  imagem_url: string | null;
  criado_em: string;
  origem?: "web" | "mqtt";
  origem_peso?: "balanca" | "manual";
  posto_nome?: string | null;
  criterios?: { qr: Criterio; peso: Criterio; imagem: Criterio };
  verificacao_imagem?: { confere: boolean; confianca: number; observacao: string } | null;
  avisos?: string[];
}

interface Calibracao {
  id: number;
  peso_referencia: number | string;
  peso_lido: number | string;
  erro_percentual: number | string;
  aprovada: number | boolean;
  criado_em: string;
}

const formatWeightKg = (peso: number) =>
  peso.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const kg = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toFixed(3);

// Peso mínimo para considerar que há uma caixa na balança (validação automática)
const PESO_MINIMO_CAIXA = 0.05;
const PESO_BALANCA_VAZIA = 0.02;
const CALIBRACAO_VALIDADE_DIAS = 7;

interface HWStatus {
  esp32: DevStatus;
  arduino: DevStatus;
  sensor: DevStatus;
  camera: DevStatus;
}

const CRITERIO_STYLE: Record<Criterio, { cls: string; label: string; Icon: React.ElementType }> = {
  ok:             { cls: "bg-green-100 text-green-700", label: "confere",        Icon: CheckCircle2 },
  falhou:         { cls: "bg-red-100 text-red-700",     label: "diverge",        Icon: XCircle },
  nao_verificado: { cls: "bg-gray-100 text-gray-600",   label: "não verificado", Icon: MinusCircle },
};

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
  // O peso só pode ser digitado com a entrada manual liberada — e fica registrado assim.
  const [pesoManual, setPesoManual] = useState(false);
  const [autoValidar, setAutoValidar] = useState(false);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [postoId, setPostoId] = useState("");

  const [isValidating, setIsValidating] = useState(false);
  const [resultado, setResultado] = useState<Validacao | null>(null);
  const [historico, setHistorico] = useState<Validacao[]>([]);

  const [calibracoes, setCalibracoes] = useState<Calibracao[]>([]);
  const [massaPadrao, setMassaPadrao] = useState("1,000");
  const [calibrando, setCalibrando] = useState(false);

  const weightNotifiedRef = useRef(false);
  // Refs lidas pelo handler do socket (validação automática ao estabilizar o peso)
  const autoRef = useRef(false);
  const armadoRef = useRef(true);
  const validandoRef = useRef(false);
  const validarRef = useRef<(pesoBalanca?: number) => void>(() => {});

  useEffect(() => { autoRef.current = autoValidar; armadoRef.current = true; }, [autoValidar]);

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
      // Validação automática: caixa colocada (peso estável acima do mínimo)
      // dispara uma vez; rearma quando a balança volta a ficar vazia.
      if (p < PESO_BALANCA_VAZIA) armadoRef.current = true;
      else if (autoRef.current && armadoRef.current && p >= PESO_MINIMO_CAIXA && !validandoRef.current) {
        armadoRef.current = false;
        validarRef.current(p);
      }
    };

    const onValidacao = (data: Validacao) => {
      setHistorico((prev) => [data, ...prev.filter((v) => v.id !== data.id)].slice(0, 20));
    };

    const onDispositivo = (dev: { tipo: string; status: DevStatus }) => {
      if (dev.tipo === "esp32") setHwStatus((p) => ({ ...p, esp32: dev.status }));
      else if (dev.tipo === "arduino_uno") setHwStatus((p) => ({ ...p, arduino: dev.status }));
    };

    const onCalibracao = (c: Calibracao) => setCalibracoes((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);

    socket.on("peso_atualizado", onPeso);
    socket.on("validacao_concluida", onValidacao);
    socket.on("dispositivo_atualizado", onDispositivo);
    socket.on("calibracao_registrada", onCalibracao);

    return () => {
      socket.off("peso_atualizado", onPeso);
      socket.off("validacao_concluida", onValidacao);
      socket.off("dispositivo_atualizado", onDispositivo);
      socket.off("calibracao_registrada", onCalibracao);
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

  useEffect(() => {
    api.get<Calibracao[]>("/api/validacoes/calibracoes", { params: postoId ? { posto_id: postoId } : {} })
      .then((r) => setCalibracoes(r.data))
      .catch(() => setCalibracoes([]));
  }, [postoId]);

  const ultimaCalibracao = calibracoes[0];
  const calibracaoValida = !!ultimaCalibracao && !!Number(ultimaCalibracao.aprovada) &&
    (Date.now() - new Date(ultimaCalibracao.criado_em).getTime()) / 86400000 <= CALIBRACAO_VALIDADE_DIAS;

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

  const validarItem = async (pesoBalanca?: number) => {
    if (!cameraUrl.trim()) { toast.error("Configure a URL da câmera primeiro"); return; }
    const pesoNum = pesoBalanca ?? Number(peso.replace(",", "."));
    if (!peso && pesoBalanca === undefined) { toast.error("Aguardando leitura da balança"); return; }
    if (!Number.isFinite(pesoNum) || pesoNum <= 0) { toast.error("Peso inválido"); return; }

    validandoRef.current = true;
    setIsValidating(true);
    setResultado(null);
    toast.info("🔍 Capturando imagem, lendo QR e cruzando peso + imagem...");
    try {
      const { data } = await api.post<Validacao>("/api/validacoes", {
        camera_url: cameraUrl,
        peso_medido: pesoNum,
        posto_id: postoId || null,
        origem_peso: pesoManual ? "manual" : "balanca",
      });
      setResultado(data);
      if (data.resultado === "aprovado") toast.success("✅ Caixa aprovada para expedição!");
      // A reprovação já gera alerta global (layout), em qualquer tela.
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Falha ao validar item"));
    } finally {
      validandoRef.current = false;
      setIsValidating(false);
    }
  };
  validarRef.current = (p) => { if (cameraActive) validarItem(p); };

  const registrarCalibracao = async () => {
    const referencia = Number(massaPadrao.replace(",", "."));
    const lido = Number(peso.replace(",", "."));
    if (!Number.isFinite(referencia) || referencia <= 0) { toast.error("Informe a massa padrão em kg"); return; }
    if (!peso || !Number.isFinite(lido)) { toast.error("Coloque a massa padrão na balança e aguarde a leitura"); return; }
    setCalibrando(true);
    try {
      const { data } = await api.post<Calibracao & { erro_maximo_percentual: number }>("/api/validacoes/calibracoes", {
        posto_id: postoId || null,
        peso_referencia: referencia,
        peso_lido: lido,
      });
      setCalibracoes((prev) => [data, ...prev]);
      if (Number(data.aprovada)) toast.success(`Balança calibrada — erro de ${Number(data.erro_percentual).toFixed(2)}%`);
      else toast.error(`Erro de ${Number(data.erro_percentual).toFixed(2)}% acima do limite de ${data.erro_maximo_percentual}%. Ajuste o CALIBRATION_FACTOR e repita.`);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Falha ao registrar calibração"));
    } finally {
      setCalibrando(false);
    }
  };

  const hwItems: { label: string; icon: React.ElementType; key: keyof HWStatus }[] = [
    { label: "ESP32",   icon: Cpu,      key: "esp32"   },
    { label: "Arduino", icon: Zap,      key: "arduino" },
    { label: "Balança", icon: Activity, key: "sensor"  },
    { label: "Câmera",  icon: Camera,   key: "camera"  },
  ];

  const postoAtual = postos.find((p) => String(p.id) === postoId);
  const balancaAtiva = hwStatus.sensor === "ativo";
  const podeValidar = !isValidating && (balancaAtiva || pesoManual) && !!peso;

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-[#424242] mb-1">Posto de Validação</h1>
        <p className="text-[#717182]">Imagem + peso + QR Code cruzados antes do despacho — caixa divergente fica retida</p>
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
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button onClick={conectarHardware} className="bg-[#66BB6A] hover:bg-[#4CAF50] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <Wifi className="w-4 h-4" /> Conectar ESP32 + Arduino
        </button>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${calibracaoValida ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          <Scale className="w-3.5 h-3.5" />
          {calibracaoValida
            ? `Balança calibrada em ${new Date(ultimaCalibracao!.criado_em).toLocaleDateString("pt-BR")} (erro ${Number(ultimaCalibracao!.erro_percentual).toFixed(2)}%)`
            : `Balança sem calibração válida (últimos ${CALIBRACAO_VALIDADE_DIAS} dias)`}
        </span>
        {postoAtual?.linha && postoAtual?.codigo && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-white border border-gray-100 text-[#424242]" title="Tópico MQTT deste posto">
            <Radio className="w-3.5 h-3.5 text-[#2E7D32]" /> {postoAtual.linha}/{postoAtual.codigo}/validacao
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: camera + balança, alternando com um clique */}
        <div className="space-y-4">
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
                {balancaAtiva && !pesoManual && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-normal">da balança</span>}
                {pesoManual && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-normal">manual</span>}
              </h3>
              <div className="relative">
                <input
                  type="text" inputMode="decimal" value={peso}
                  readOnly={!pesoManual}
                  onChange={(e) => setPeso(e.target.value.replace(".", ","))}
                  placeholder={pesoManual ? "0,000" : "aguardando balança"}
                  className={`w-full px-4 py-3 pr-10 rounded-lg border border-transparent focus:border-[#2E7D32] focus:outline-none transition-all ${pesoManual ? "bg-amber-50" : "bg-[#F5F5F5] cursor-not-allowed"}`}
                />
                {pesoManual ? <Unlock className="w-4 h-4 absolute right-3 top-3.5 text-amber-600" /> : <Lock className="w-4 h-4 absolute right-3 top-3.5 text-[#717182]" />}
              </div>
              <label className="flex items-start gap-2 text-xs text-[#717182] cursor-pointer">
                <input type="checkbox" checked={pesoManual} onChange={(e) => setPesoManual(e.target.checked)} className="mt-0.5" />
                Liberar digitação manual (fica registrado na validação como "peso manual")
              </label>

              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-xs font-semibold text-[#424242] flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" /> Calibração contra massa padrão</p>
                <p className="text-xs text-[#717182]">Coloque uma massa conhecida na balança vazia e registre. Erro aceito: até 1%.</p>
                <div className="flex gap-2">
                  <input
                    type="text" inputMode="decimal" value={massaPadrao}
                    onChange={(e) => setMassaPadrao(e.target.value.replace(".", ","))}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none text-sm"
                    aria-label="Massa padrão (kg)"
                  />
                  <button
                    onClick={registrarCalibracao}
                    disabled={calibrando}
                    className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-60 flex-shrink-0"
                  >
                    {calibrando ? "..." : "Registrar"}
                  </button>
                </div>
              </div>
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
                  {postos.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.nome}{p.linha && p.codigo ? ` · ${p.linha}/${p.codigo}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex items-start gap-2 text-xs text-[#424242] cursor-pointer">
              <input type="checkbox" checked={autoValidar} onChange={(e) => setAutoValidar(e.target.checked)} className="mt-0.5" />
              <span>
                <span className="font-semibold">Validação automática</span>
                <span className="block text-[#717182]">Valida sozinho quando a caixa é colocada e o peso estabiliza (câmera conectada).</span>
              </span>
            </label>

            <button
              onClick={() => validarItem()}
              disabled={!podeValidar}
              className="w-full bg-gradient-to-r from-[#2E7D32] to-[#66BB6A] hover:from-[#1B5E20] hover:to-[#4CAF50] text-white py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isValidating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
              {isValidating ? "Validando..." : "Capturar e Validar"}
            </button>
            {!balancaAtiva && !pesoManual && (
              <p className="text-xs text-[#717182] text-center">Aguardando leitura da balança.</p>
            )}
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
                    {resultado.resultado === "aprovado" ? "Aprovada — liberada para despacho" : "Reprovada — caixa retida no posto"}
                  </p>
                  {resultado.motivo_divergencia && (
                    <p className="text-sm text-[#717182] mt-0.5">{resultado.motivo_divergencia}</p>
                  )}
                </div>
              </div>

              {resultado.criterios && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {([
                    { key: "qr", label: "QR Code", Icon: QrCode },
                    { key: "peso", label: "Peso", Icon: Scale },
                    { key: "imagem", label: "Imagem", Icon: ImageIcon },
                  ] as const).map(({ key, label, Icon }) => {
                    const st = CRITERIO_STYLE[resultado.criterios![key]];
                    return (
                      <div key={key} className={`rounded-lg px-3 py-2 flex items-center gap-2 ${st.cls}`}>
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold">{label}</p>
                          <p className="text-[11px] flex items-center gap-1"><st.Icon className="w-3 h-3" /> {st.label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-[#717182] flex items-center gap-1"><PackageSearch className="w-3 h-3" /> Produto</p>
                  <p className="font-semibold text-[#424242]">{resultado.produto_nome || "Não identificado"}</p>
                  {resultado.produto_sku && <p className="text-xs text-[#717182]">{resultado.produto_sku}</p>}
                </div>
                <div>
                  <p className="text-xs text-[#717182] flex items-center gap-1"><QrCode className="w-3 h-3" /> Caixa (QR)</p>
                  <p className="font-mono text-xs text-[#424242] break-all">{resultado.qrcode_lido || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-[#717182]">Peso Medido</p>
                  <p className="font-semibold text-[#424242]">{kg(resultado.peso_medido)} kg</p>
                  <p className="text-xs text-[#717182]">{resultado.origem_peso === "manual" ? "digitado" : "da balança"}</p>
                </div>
                <div>
                  <p className="text-xs text-[#717182]">Verificação da imagem</p>
                  <p className="text-[#424242] text-xs">
                    {resultado.verificacao_imagem
                      ? `${resultado.verificacao_imagem.observacao || (resultado.verificacao_imagem.confere ? "Confere" : "Não confere")} (${resultado.verificacao_imagem.confianca.toFixed(0)}%)`
                      : "Não verificada"}
                  </p>
                </div>
              </div>

              {resultado.avisos && resultado.avisos.length > 0 && (
                <ul className="mt-4 space-y-1">
                  {resultado.avisos.map((a) => (
                    <li key={a} className="text-xs text-amber-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {a}
                    </li>
                  ))}
                </ul>
              )}

              {resultado.imagem_url && (
                <img src={`${API_URL}${resultado.imagem_url}`} alt="Captura" className="mt-4 rounded-lg max-h-64 object-cover" />
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-[#717182]">
              <ScanLine className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Conecte a câmera e a balança e clique em "Capturar e Validar" — ou ligue a validação automática.</p>
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
                    <th className="px-4 py-2 text-left font-semibold text-[#424242]">Origem</th>
                    <th className="px-4 py-2 text-left font-semibold text-[#424242]">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historico.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-[#717182]">Nenhuma validação registrada ainda.</td></tr>
                  ) : historico.map((v) => (
                    <tr key={v.id}>
                      <td className="px-4 py-2 text-[#424242]">{v.produto_nome || "—"}</td>
                      <td className="px-4 py-2 text-[#424242]">{kg(v.peso_medido)} kg</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${v.resultado === "aprovado" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {v.resultado === "aprovado" ? "Aprovado" : "Retida"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-[#717182]">
                        {v.origem === "mqtt" ? "Posto (MQTT)" : "Web"}{v.origem_peso === "manual" ? " · manual" : ""}
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
