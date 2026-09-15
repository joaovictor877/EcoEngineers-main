import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, RefreshCw, Camera as CameraIcon, X, Wifi, Eye, EyeOff, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import api, { API_URL } from "../lib/api";
import { CameraLivePreview, CameraPushPreview } from "../components/camera-preview";
import type { DevStatus } from "../components/camera-preview";

interface Camera {
  id: number;
  nome: string;
  url_stream: string;
  protocolo: "http" | "rtsp";
  modo_conexao: "pull" | "push";
  status: "ativa" | "inativa" | "erro";
  criado_em: string;
}

type FormState = {
  nome: string;
  protocolo: "http" | "rtsp";
  modo_conexao: "pull" | "push";
  url_stream: string;
  rtsp_ip: string;
  rtsp_porta: string;
  rtsp_usuario: string;
  rtsp_chave: string;
  rtsp_canal: string;
  rtsp_subtipo: "0" | "1";
};

const EMPTY_FORM: FormState = {
  nome: "", protocolo: "rtsp", modo_conexao: "push", url_stream: "",
  rtsp_ip: "", rtsp_porta: "554", rtsp_usuario: "admin", rtsp_chave: "",
  rtsp_canal: "1", rtsp_subtipo: "0",
};

function montarRtspUrl(f: FormState) {
  const porta = f.rtsp_porta || "554";
  const usuario = f.rtsp_usuario || "admin";
  return `rtsp://${encodeURIComponent(usuario)}:${encodeURIComponent(f.rtsp_chave)}@${f.rtsp_ip}:${porta}/cam/realmonitor?channel=${f.rtsp_canal || "1"}&subtype=${f.rtsp_subtipo}`;
}

export function CameraManagement() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showChave, setShowChave] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewStatus, setPreviewStatus] = useState<DevStatus>("inativa");
  const [bridgeCommand, setBridgeCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { loadCameras(); }, []);

  async function loadCameras() {
    setLoading(true);
    try {
      const { data } = await api.get<Camera[]>("/api/cameras");
      setCameras(data);
    } catch {
      toast.error("Falha ao carregar câmeras");
    } finally {
      setLoading(false);
    }
  }

  const getApiErrorMessage = (error: unknown, fallback: string) =>
    (error as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (c: Camera) => {
    setEditing(c);
    setForm({
      ...EMPTY_FORM, nome: c.nome, protocolo: c.protocolo, modo_conexao: c.modo_conexao,
      url_stream: c.protocolo === "http" ? c.url_stream : "",
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (form.protocolo === "rtsp" && (!form.rtsp_ip.trim() || !form.rtsp_chave.trim())) {
      toast.error("Informe o IP e a chave de acesso da câmera RTSP");
      return;
    }
    if (form.protocolo === "http" && !form.url_stream.trim()) {
      toast.error("Informe a URL da câmera");
      return;
    }
    setSaving(true);
    try {
      const payload = form.protocolo === "rtsp"
        ? {
            nome: form.nome, protocolo: "rtsp", modo_conexao: form.modo_conexao,
            rtsp_ip: form.rtsp_ip.trim(), rtsp_porta: form.rtsp_porta,
            rtsp_usuario: form.rtsp_usuario || "admin", rtsp_chave: form.rtsp_chave,
            rtsp_canal: form.rtsp_canal, rtsp_subtipo: form.rtsp_subtipo,
          }
        : { nome: form.nome, protocolo: "http", modo_conexao: "pull", url_stream: form.url_stream.trim() };

      let saved: Camera;
      if (editing) {
        const { data } = await api.put<Camera>(`/api/cameras/${editing.id}`, payload);
        saved = data;
        setCameras((prev) => prev.map((c) => (c.id === editing.id ? data : c)));
        toast.success("Câmera atualizada!");
      } else {
        const { data } = await api.post<Camera>("/api/cameras", payload);
        saved = data;
        setCameras((prev) => [data, ...prev]);
        toast.success("Câmera cadastrada!");
      }
      setShowModal(false);

      if (form.protocolo === "rtsp" && form.modo_conexao === "push") {
        const cmd = `.\\scripts\\bridge-camera-online.ps1 -RtspUrl "${montarRtspUrl(form)}" -CameraId ${saved.id} -ApiUrl "${API_URL || window.location.origin}" -ApiKey "SUA_HARDWARE_API_KEY"`;
        setBridgeCommand(cmd);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Falha ao salvar câmera"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, nome: string) => {
    if (!window.confirm(`Remover a câmera "${nome}"?`)) return;
    try {
      await api.delete(`/api/cameras/${id}`);
      setCameras((prev) => prev.filter((c) => c.id !== id));
      if (previewId === id) setPreviewId(null);
      toast.success("Câmera removida!");
    } catch {
      toast.error("Falha ao remover câmera");
    }
  };

  const togglePreview = (id: number) => {
    setPreviewStatus("inativa");
    setPreviewId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#424242] mb-1">Câmeras</h1>
          <p className="text-[#717182]">Cadastre suas câmeras (RTSP como a Intelbras Mibo, ou IP HTTP) e veja a imagem ao vivo</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadCameras} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-[#717182]" title="Atualizar">
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={openAdd} className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Nova Câmera
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {cameras.length === 0 && !loading && (
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-[#717182]">
            <CameraIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma câmera cadastrada ainda.</p>
          </div>
        )}

        {cameras.map((c) => (
          <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <CameraIcon className="w-4 h-4 text-[#2E7D32]" />
                <h3 className="font-semibold text-[#424242] text-sm">{c.nome}</h3>
                <span className="text-xs bg-[#2E7D32]/10 text-[#2E7D32] px-2 py-0.5 rounded-full font-medium uppercase">
                  {c.protocolo}
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                  {c.modo_conexao === "push" ? "ponte local" : "acesso direto"}
                </span>
                {previewId === c.id && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${previewStatus === "ativa" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {previewStatus === "ativa" ? "ao vivo" : "conectando..."}
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => togglePreview(c.id)} className="p-2 hover:bg-blue-50 rounded-lg transition-colors group" title={previewId === c.id ? "Ocultar preview" : "Ver ao vivo"}>
                  {previewId === c.id ? <EyeOff className="w-4 h-4 text-[#717182] group-hover:text-blue-600" /> : <Eye className="w-4 h-4 text-[#717182] group-hover:text-blue-600" />}
                </button>
                <button onClick={() => openEdit(c)} className="p-2 hover:bg-blue-50 rounded-lg transition-colors group" title="Editar">
                  <Edit className="w-4 h-4 text-[#717182] group-hover:text-blue-600" />
                </button>
                <button onClick={() => handleDelete(c.id, c.nome)} className="p-2 hover:bg-red-50 rounded-lg transition-colors group" title="Remover">
                  <Trash2 className="w-4 h-4 text-[#717182] group-hover:text-red-600" />
                </button>
              </div>
            </div>
            <div className="aspect-video bg-gray-900 flex items-center justify-center overflow-hidden">
              {previewId === c.id ? (
                c.modo_conexao === "push" ? (
                  <CameraPushPreview cameraId={c.id} onStatusChange={setPreviewStatus} />
                ) : (
                  <CameraLivePreview cameraId={c.id} onStatusChange={setPreviewStatus} />
                )
              ) : (
                <div className="text-center text-gray-500 p-6">
                  <CameraIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Clique no ícone de olho para ver ao vivo</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#424242]">{editing ? "Editar Câmera" : "Nova Câmera"}</h2>
              <button onClick={() => !saving && setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-[#717182]" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">Nome <span className="text-red-500">*</span></label>
                <input type="text" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Posto de Embalagem 01" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" autoFocus />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">Tipo de Câmera</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setForm((f) => ({ ...f, protocolo: "rtsp" }))} className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.protocolo === "rtsp" ? "bg-[#2E7D32] text-white border-[#2E7D32]" : "bg-[#F5F5F5] text-[#424242] border-transparent"}`}>
                    RTSP (Intelbras Mibo)
                  </button>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, protocolo: "http" }))} className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.protocolo === "http" ? "bg-[#2E7D32] text-white border-[#2E7D32]" : "bg-[#F5F5F5] text-[#424242] border-transparent"}`}>
                    IP HTTP (genérica)
                  </button>
                </div>
              </div>

              {form.protocolo === "rtsp" ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-[#424242] mb-1.5">Onde a câmera está?</label>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, modo_conexao: "push" }))}
                        className={`text-left px-3 py-2.5 rounded-lg text-sm border transition-colors ${form.modo_conexao === "push" ? "bg-[#2E7D32] text-white border-[#2E7D32]" : "bg-[#F5F5F5] text-[#424242] border-transparent"}`}
                      >
                        <span className="font-medium">Rede diferente do servidor (recomendado p/ Azure)</span>
                        <span className={`block text-xs mt-0.5 ${form.modo_conexao === "push" ? "text-white/80" : "text-[#717182]"}`}>
                          Uma ponte local envia as fotos pro servidor — não precisa VPN nem porta aberta.
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, modo_conexao: "pull" }))}
                        className={`text-left px-3 py-2.5 rounded-lg text-sm border transition-colors ${form.modo_conexao === "pull" ? "bg-[#2E7D32] text-white border-[#2E7D32]" : "bg-[#F5F5F5] text-[#424242] border-transparent"}`}
                      >
                        <span className="font-medium">Mesma rede do servidor</span>
                        <span className={`block text-xs mt-0.5 ${form.modo_conexao === "pull" ? "text-white/80" : "text-[#717182]"}`}>
                          O servidor acessa a câmera direto (ex: testando local, ou servidor na sua VPS/rede).
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-[#424242] mb-1.5">IP da Câmera <span className="text-red-500">*</span></label>
                      <input type="text" value={form.rtsp_ip} onChange={(e) => setForm((f) => ({ ...f, rtsp_ip: e.target.value }))} placeholder="192.168.1.50" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#424242] mb-1.5">Porta</label>
                      <input type="text" inputMode="numeric" value={form.rtsp_porta} onChange={(e) => setForm((f) => ({ ...f, rtsp_porta: e.target.value }))} placeholder="554" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#424242] mb-1.5">Usuário</label>
                    <input type="text" value={form.rtsp_usuario} onChange={(e) => setForm((f) => ({ ...f, rtsp_usuario: e.target.value }))} placeholder="admin" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#424242] mb-1.5">
                      Chave de Acesso <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showChave ? "text" : "password"}
                        value={form.rtsp_chave}
                        onChange={(e) => setForm((f) => ({ ...f, rtsp_chave: e.target.value }))}
                        placeholder="Encontrada no app Mibo: Configurações > Câmera > Etiqueta do Dispositivo"
                        className="w-full px-4 py-3 pr-11 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm"
                      />
                      <button type="button" onClick={() => setShowChave((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#717182]">
                        {showChave ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-[#717182] mt-1">
                      No app Mibo: toque na câmera → Configurações → Etiqueta do Dispositivo.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-[#424242] mb-1.5">Canal</label>
                      <input type="text" inputMode="numeric" value={form.rtsp_canal} onChange={(e) => setForm((f) => ({ ...f, rtsp_canal: e.target.value }))} placeholder="1" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#424242] mb-1.5">Qualidade</label>
                      <select value={form.rtsp_subtipo} onChange={(e) => setForm((f) => ({ ...f, rtsp_subtipo: e.target.value as "0" | "1" }))} className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm bg-white">
                        <option value="0">Principal (HD)</option>
                        <option value="1">Secundária (leve)</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-[#717182] -mt-2 flex items-center gap-1">
                    <Wifi className="w-3 h-3" />
                    {form.modo_conexao === "push"
                      ? "Depois de salvar, você vai receber o comando pra rodar a ponte local (PC na mesma rede da câmera)."
                      : "A câmera precisa estar na mesma rede do servidor, com IP fixo configurado no app Mibo."}
                  </p>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-1.5">URL da Câmera <span className="text-red-500">*</span></label>
                  <input type="text" value={form.url_stream} onChange={(e) => setForm((f) => ({ ...f, url_stream: e.target.value }))} placeholder="https://camera.exemplo.com.br" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => !saving && setShowModal(false)} disabled={saving} className="flex-1 px-4 py-3 rounded-lg border border-gray-200 text-[#424242] font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-3 rounded-lg bg-[#2E7D32] text-white font-medium hover:bg-[#1B5E20] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Salvando...</> : (editing ? "Salvar Alterações" : "Cadastrar Câmera")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bridgeCommand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setBridgeCommand(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#424242]">Rode a ponte local</h2>
              <button onClick={() => setBridgeCommand(null)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-[#717182]" />
              </button>
            </div>
            <p className="text-sm text-[#717182] mb-3">
              Abra o PowerShell num PC/notebook que esteja na <strong>mesma rede Wi-Fi da câmera</strong>, dentro da pasta do projeto, troque <code>SUA_HARDWARE_API_KEY</code> pela chave configurada no servidor (<code>HARDWARE_API_KEY</code>) e rode:
            </p>
            <div className="relative">
              <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{bridgeCommand}</pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(bridgeCommand);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="absolute top-2 right-2 p-1.5 bg-gray-800 hover:bg-gray-700 rounded-md text-white"
                title="Copiar"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-[#717182] mt-3">
              Deixe essa janela do PowerShell aberta enquanto quiser a câmera ao vivo no site. Depois volte aqui e clique no ícone de olho pra ver.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
