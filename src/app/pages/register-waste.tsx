import { useState, useEffect, useRef } from "react";
import {
  Camera, Save, Wifi, RefreshCw, CheckCircle, DollarSign, TrendingDown, X, Upload,
} from "lucide-react";
import { toast } from "sonner";
import api, { API_URL } from "../lib/api";
import { socket } from "../lib/socket";
import { FastCameraPreview, normalizeCameraBase } from "../components/camera-preview";

interface Material {
  id: number;
  name: string;
  category: string;
  unit: string;
  valor_unitario_kg: number;
  custo_reaproveitamento_kg: number;
}

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
  const [pesoLive, setPesoLive] = useState(false);

  const [cameraUrl, setCameraUrl] = useState(
    import.meta.env.VITE_CAMERA_URL || "https://camera.joaovictor.app.br"
  );
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraSession, setCameraSession] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);

  // Foto de evidência: ou um arquivo escolhido manualmente (fotoFile), ou o
  // caminho já salvo no servidor por uma captura de câmera (fotoServerUrl) —
  // nunca os dois ao mesmo tempo. Serve só de registro, não classifica nada.
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoServerUrl, setFotoServerUrl] = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  const weightConnectionNotifiedRef = useRef(false);

  const getApiErrorMessage = (error: any, fallback: string) => {
    const serverMessage = error?.response?.data?.error;
    if (typeof serverMessage === "string" && serverMessage.trim()) return serverMessage;
    return fallback;
  };

  const formatWeightKg = (peso: number) =>
    peso.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  const parseWeightKg = (peso: string) => Number(peso.replace(",", "."));

  // ── Socket.IO — só preenche o peso automaticamente. A conectividade do
  // ESP32/Arduino é gerenciada e exibida no Posto de Validação.
  useEffect(() => {
    socket.connect();

    const onPeso = (data: { peso: number; dispositivo: string }) => {
      const peso = Number(data.peso);
      if (!Number.isFinite(peso)) return;

      const formattedWeight = formatWeightKg(peso);
      setFormData((prev) => (
        prev.weight === formattedWeight ? prev : { ...prev, weight: formattedWeight }
      ));
      setPesoLive(true);

      if (!weightConnectionNotifiedRef.current) {
        toast.success(`Balança ativa — peso inicial: ${formattedWeight} kg`);
        weightConnectionNotifiedRef.current = true;
      }
    };

    socket.on("peso_atualizado", onPeso);

    return () => {
      socket.off("peso_atualizado", onPeso);
      socket.disconnect();
    };
  }, []);

  // Load materials list
  useEffect(() => {
    api.get<Material[]>("/api/materials")
      .then((r) => setMaterialsList(r.data))
      .catch(() => toast.error("Falha ao carregar lista de materiais"));
  }, []);

  const conectarCamera = () => {
    const normalizedUrl = normalizeCameraBase(cameraUrl);
    if (!normalizedUrl) { toast.error("Informe a URL da câmera"); return; }
    setCameraUrl(normalizedUrl);
    setCameraActive(true);
    setCameraSession((session) => session + 1);
    toast.success("📷 Câmera IP conectada!");
  };

  const limparFoto = () => {
    setFotoFile(null);
    setFotoServerUrl(null);
    setFotoPreview(null);
  };

  const capturarFoto = async () => {
    if (!cameraUrl.trim()) { toast.error("Configure a URL da câmera primeiro"); return; }
    setIsCapturing(true);
    toast.info("📸 Capturando foto...");
    try {
      const { data } = await api.post<{ imagem_url: string }>("/api/cameras/snapshot", { camera_url: cameraUrl });
      setFotoFile(null);
      setFotoServerUrl(data.imagem_url);
      setFotoPreview(`${API_URL}${data.imagem_url}`);
      toast.success("Foto capturada e anexada como evidência.");
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Falha ao capturar foto da câmera. Verifique a URL."));
    } finally {
      setIsCapturing(false);
    }
  };

  const handleUploadImagem = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoServerUrl(null);
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
    toast.success("Foto anexada como evidência.");
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
      const payload = new FormData();
      payload.append("material_id", formData.material_id);
      payload.append("peso", String(pesoKg));
      payload.append("setor_origem", formData.department);
      payload.append("destino", formData.destination);
      payload.append("observacao", formData.observation);
      if (fotoFile) payload.append("foto", fotoFile);
      else if (fotoServerUrl) payload.append("foto_url", fotoServerUrl);

      await api.post("/api/residuos", payload, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("✅ Resíduo registrado com sucesso!");
      setFormData({
        material_id: "", materialType: "", category: "", weight: "",
        department: "", date: new Date().toISOString().split("T")[0],
        destination: "", observation: "",
      });
      limparFoto();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Falha ao registrar resíduo"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedMaterial = materialsList.find((m) => String(m.id) === formData.material_id) || null;
  const impactoFinanceiro = (() => {
    const pesoNum = parseWeightKg(formData.weight);
    if (!selectedMaterial || !formData.destination || !Number.isFinite(pesoNum) || pesoNum <= 0) return null;
    const valorKg = Number(selectedMaterial.valor_unitario_kg) || 0;
    const custoKg = Number(selectedMaterial.custo_reaproveitamento_kg) || 0;
    if (formData.destination === "descarte") {
      return { tipo: "prejuizo" as const, valor: pesoNum * valorKg };
    }
    return { tipo: "economia" as const, valor: pesoNum * (valorKg - custoKg), custo: pesoNum * custoKg };
  })();

  const inputClass = (highlighted = false) =>
    `w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all ${
      highlighted
        ? "border-[#2E7D32] bg-green-50"
        : "bg-[#F5F5F5] border-transparent focus:border-[#2E7D32]"
    }`;

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-[#424242] mb-1">
          Registro de Resíduos
        </h1>
        <p className="text-[#717182]">
          Classificação manual pela equipe · foto só como evidência
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT: Foto de evidência ── */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-[#424242] flex items-center gap-2 text-sm">
                <Camera className="w-4 h-4 text-[#2E7D32]" /> Foto do Material
              </h3>
              {cameraActive && (
                <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> AO VIVO
                </span>
              )}
            </div>
            <div className="aspect-video bg-gray-900 flex items-center justify-center overflow-hidden relative">
              {fotoPreview ? (
                <>
                  <img src={fotoPreview} alt="Evidência do material" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={limparFoto}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white"
                    title="Remover foto"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : cameraActive ? (
                <FastCameraPreview
                  key={`${cameraUrl}-${cameraSession}`}
                  cameraUrl={cameraUrl}
                  onStatusChange={() => {}}
                />
              ) : (
                <div className="text-center text-gray-500 p-6">
                  <Camera className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma foto anexada</p>
                  <p className="text-xs mt-1 opacity-60">Conecte a câmera ou envie uma imagem</p>
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
                <button type="button" onClick={conectarCamera} className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1">
                  <Wifi className="w-3.5 h-3.5" /> Conectar
                </button>
                <button type="button" onClick={capturarFoto} disabled={isCapturing} className="bg-[#F5F5F5] hover:bg-[#E0E0E0] text-[#424242] py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 disabled:opacity-50">
                  {isCapturing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                  Capturar
                </button>
              </div>
              <label className="w-full cursor-pointer bg-[#F5F5F5] hover:bg-[#E8F5E9] text-[#424242] py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm border border-dashed border-gray-300 hover:border-[#2E7D32]">
                <Upload className="w-4 h-4" /> Enviar Imagem
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadImagem} />
              </label>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs text-amber-800 leading-relaxed">
              A foto é só um registro de evidência do material. O tipo, peso e
              destino devem ser confirmados manualmente pela equipe ao lado —
              a aparência de uma peça (pintura, tratamento superficial etc.)
              pode não corresponder ao material real.
            </p>
          </div>
        </div>

        {/* ── RIGHT: Form ── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-2">Tipo de Material</label>
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
                    className={inputClass()}
                    required
                  >
                    <option value="">Selecione o material</option>
                    {materialsList.map((m) => (
                      <option key={m.id} value={String(m.id)}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-2">Categoria</label>
                  <input type="text" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className={inputClass()} placeholder="Ex: Metal Não Ferroso" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#424242] mb-2">
                  Peso (kg)
                  {pesoLive && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-normal">Auto — Sensor HX711</span>}
                </label>
                <input type="text" inputMode="decimal" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value.replace(".", ",") })} className={inputClass(pesoLive)} placeholder="0,000" required />
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
                  <label className="block text-sm font-medium text-[#424242] mb-2">Destino</label>
                  <select value={formData.destination} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} className={inputClass()} required>
                    <option value="">Selecione o destino</option>
                    <option value="reaproveitamento">Reaproveitamento Interno</option>
                    <option value="reciclagem">Reciclagem Externa</option>
                    <option value="descarte">Descarte Controlado</option>
                    <option value="venda">Venda para Terceiros</option>
                  </select>
                </div>
              </div>

              {impactoFinanceiro && (
                impactoFinanceiro.tipo === "prejuizo" ? (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
                    <TrendingDown className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">
                      Prejuízo estimado com o descarte: <span className="font-bold">R$ {impactoFinanceiro.valor.toFixed(2)}</span>
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700">
                    <DollarSign className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">
                      Economia líquida estimada: <span className="font-bold">R$ {impactoFinanceiro.valor.toFixed(2)}</span>
                      {impactoFinanceiro.custo !== undefined && (
                        <span className="text-green-600/80"> (custo de reaproveitamento: R$ {impactoFinanceiro.custo.toFixed(2)})</span>
                      )}
                    </p>
                  </div>
                )
              )}

              <div>
                <label className="block text-sm font-medium text-[#424242] mb-2">Data</label>
                <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className={inputClass()} required />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#424242] mb-2">Observação</label>
                <textarea value={formData.observation} onChange={(e) => setFormData({ ...formData, observation: e.target.value })} className={`${inputClass()} resize-none`} rows={3} placeholder="Observações adicionais sobre o material..." />
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
