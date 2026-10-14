import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, RefreshCw, Radio, X } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

interface Posto {
  id: number;
  nome: string;
  linha: string | null;
  codigo: string | null;
  camera_id: number | null;
  localizacao: string | null;
  status: "ativo" | "inativo" | "erro";
}

interface Camera {
  id: number;
  nome: string;
}

const VAZIO = { nome: "", linha: "linha-01", codigo: "", camera_id: "", localizacao: "", status: "ativo" };

/**
 * Postos de validação organizados por linha. A dupla linha/código forma o
 * tópico MQTT do posto (ex: linha-01/posto-03/validacao), por onde o
 * ESP32 do posto publica peso + id da caixa.
 */
export function PostosPanel() {
  const [postos, setPostos] = useState<Posto[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(VAZIO);
  const [editando, setEditando] = useState<Posto | null>(null);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        api.get<Posto[]>("/api/validacoes/postos"),
        api.get<Camera[]>("/api/cameras").catch(() => ({ data: [] as Camera[] })),
      ]);
      setPostos(p.data);
      setCameras(c.data);
    } catch {
      toast.error("Falha ao carregar postos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo = () => {
    setEditando(null);
    setForm({ ...VAZIO, codigo: `posto-${String(postos.length + 1).padStart(2, "0")}` });
    setAberto(true);
  };

  const abrirEdicao = (p: Posto) => {
    setEditando(p);
    setForm({
      nome: p.nome, linha: p.linha || "linha-01", codigo: p.codigo || "",
      camera_id: p.camera_id ? String(p.camera_id) : "", localizacao: p.localizacao || "", status: p.status,
    });
    setAberto(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const body = { ...form, camera_id: form.camera_id || null };
      if (editando) await api.put(`/api/validacoes/postos/${editando.id}`, body);
      else await api.post("/api/validacoes/postos", body);
      toast.success(editando ? "Posto atualizado!" : "Posto cadastrado!");
      setAberto(false);
      carregar();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Falha ao salvar posto");
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (p: Posto) => {
    if (!confirm(`Remover o posto "${p.nome}"? O histórico de validações é mantido.`)) return;
    try {
      await api.delete(`/api/validacoes/postos/${p.id}`);
      toast.success("Posto removido!");
      carregar();
    } catch {
      toast.error("Falha ao remover posto");
    }
  };

  const input = "w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm";

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[#424242]">Postos e Linhas</h3>
          <p className="text-xs text-[#717182]">Cada posto publica no tópico MQTT &lt;linha&gt;/&lt;posto&gt;/validacao</p>
        </div>
        <button onClick={abrirNovo} className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Novo Posto
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F5F5F5]">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-[#424242]">Posto</th>
              <th className="px-4 py-3 text-left font-semibold text-[#424242]">Tópico MQTT</th>
              <th className="px-4 py-3 text-left font-semibold text-[#424242]">Câmera</th>
              <th className="px-4 py-3 text-left font-semibold text-[#424242]">Status</th>
              <th className="px-4 py-3 text-right font-semibold text-[#424242]">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-[#717182]"><RefreshCw className="w-4 h-4 animate-spin inline" /></td></tr>
            ) : postos.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-[#717182]">Nenhum posto cadastrado.</td></tr>
            ) : postos.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-[#424242]">{p.nome}</p>
                  {p.localizacao && <p className="text-xs text-[#717182]">{p.localizacao}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#424242]">
                    <Radio className="w-3.5 h-3.5 text-[#2E7D32]" /> {p.linha}/{p.codigo}/validacao
                  </span>
                </td>
                <td className="px-4 py-3 text-[#717182]">{cameras.find((c) => c.id === p.camera_id)?.nome || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === "ativo" ? "bg-green-100 text-green-700" : p.status === "erro" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600"}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => abrirEdicao(p)} className="p-2 rounded-lg hover:bg-gray-100 text-[#717182]" title="Editar"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => remover(p)} className="p-2 rounded-lg hover:bg-red-50 text-red-500" title="Remover"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aberto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#424242]">{editando ? "Editar Posto" : "Novo Posto"}</h3>
              <button onClick={() => !salvando && setAberto(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={salvar} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">Nome</label>
                <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Posto de Embalagem 03" className={input} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-1.5">Linha</label>
                  <input value={form.linha} onChange={(e) => setForm((f) => ({ ...f, linha: e.target.value.toLowerCase() }))} placeholder="linha-01" className={`${input} font-mono`} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-1.5">Código do posto</label>
                  <input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toLowerCase() }))} placeholder="posto-03" className={`${input} font-mono`} required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">Câmera do posto</label>
                <select value={form.camera_id} onChange={(e) => setForm((f) => ({ ...f, camera_id: e.target.value }))} className={input}>
                  <option value="">Nenhuma</option>
                  {cameras.map((c) => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
                </select>
                <p className="text-xs text-[#717182] mt-1">Usada para capturar a imagem quando a validação chega pelo posto (MQTT).</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-1.5">Localização</label>
                  <input value={form.localizacao} onChange={(e) => setForm((f) => ({ ...f, localizacao: e.target.value }))} placeholder="Expedição" className={input} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-1.5">Status</label>
                  <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={input}>
                    <option value="ativo">ativo</option>
                    <option value="inativo">inativo</option>
                    <option value="erro">erro</option>
                  </select>
                </div>
              </div>
              <p className="text-xs font-mono text-[#2E7D32] bg-[#2E7D32]/5 rounded-lg px-3 py-2">
                Tópico: {form.linha || "linha"}/{form.codigo || "posto"}/validacao
              </p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setAberto(false)} disabled={salvando} className="flex-1 px-4 py-3 rounded-lg border border-gray-200 text-[#424242] font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={salvando} className="flex-1 px-4 py-3 rounded-lg bg-[#2E7D32] text-white font-medium hover:bg-[#1B5E20] transition-colors disabled:opacity-50">
                  {salvando ? "Salvando..." : editando ? "Salvar" : "Cadastrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
