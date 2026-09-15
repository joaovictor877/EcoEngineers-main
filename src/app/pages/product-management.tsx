import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, RefreshCw, Tags, QrCode, X, Printer } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

interface Produto {
  id: number;
  sku: string;
  nome: string;
  categoria: string | null;
  peso_esperado_kg: number;
  tolerancia_kg: number;
  ativo: number | boolean;
}

interface Etiqueta {
  id: number;
  codigo_qr: string;
  pedido_referencia: string | null;
  produto_nome: string | null;
  produto_sku: string | null;
  criado_em: string;
}

export function ProductManagement() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ sku: "", nome: "", categoria: "", peso_esperado_kg: "", tolerancia_kg: "0.05" });

  const [etiquetaProdutoId, setEtiquetaProdutoId] = useState("");
  const [pedidoReferencia, setPedidoReferencia] = useState("");
  const [gerandoEtiqueta, setGerandoEtiqueta] = useState(false);
  const [qrPreview, setQrPreview] = useState<{ codigo_qr: string; qr_image: string } | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [p, e] = await Promise.all([
        api.get<Produto[]>("/api/produtos"),
        api.get<Etiqueta[]>("/api/etiquetas"),
      ]);
      setProdutos(p.data);
      setEtiquetas(e.data);
      if (p.data[0] && !etiquetaProdutoId) setEtiquetaProdutoId(String(p.data[0].id));
    } catch {
      toast.error("Falha ao carregar produtos e etiquetas");
    } finally {
      setLoading(false);
    }
  }

  const getApiErrorMessage = (error: unknown, fallback: string) =>
    (error as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

  const openAdd = () => {
    setEditing(null);
    setForm({ sku: "", nome: "", categoria: "", peso_esperado_kg: "", tolerancia_kg: "0.05" });
    setShowModal(true);
  };

  const openEdit = (p: Produto) => {
    setEditing(p);
    setForm({
      sku: p.sku, nome: p.nome, categoria: p.categoria || "",
      peso_esperado_kg: String(p.peso_esperado_kg), tolerancia_kg: String(p.tolerancia_kg),
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sku.trim() || !form.nome.trim() || !form.peso_esperado_kg) {
      toast.error("SKU, nome e peso esperado são obrigatórios");
      return;
    }
    setSaving(true);
    const payload = {
      sku: form.sku.trim(),
      nome: form.nome.trim(),
      categoria: form.categoria.trim() || null,
      peso_esperado_kg: Number(form.peso_esperado_kg.replace(",", ".")),
      tolerancia_kg: Number(form.tolerancia_kg.replace(",", ".")),
    };
    try {
      if (editing) {
        const { data } = await api.put<Produto>(`/api/produtos/${editing.id}`, payload);
        setProdutos((prev) => prev.map((p) => (p.id === editing.id ? data : p)));
        toast.success("Produto atualizado!");
      } else {
        const { data } = await api.post<Produto>("/api/produtos", payload);
        setProdutos((prev) => [...prev, data]);
        toast.success("Produto cadastrado!");
      }
      setShowModal(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Falha ao salvar produto"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, nome: string) => {
    if (!window.confirm(`Remover o produto "${nome}"? Etiquetas vinculadas também serão removidas.`)) return;
    try {
      await api.delete(`/api/produtos/${id}`);
      setProdutos((prev) => prev.filter((p) => p.id !== id));
      toast.success("Produto removido!");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Falha ao remover produto"));
    }
  };

  const gerarEtiqueta = async () => {
    if (!etiquetaProdutoId) { toast.error("Selecione um produto"); return; }
    setGerandoEtiqueta(true);
    try {
      const { data } = await api.post("/api/etiquetas", {
        produto_id: Number(etiquetaProdutoId),
        pedido_referencia: pedidoReferencia.trim() || null,
      });
      setQrPreview({ codigo_qr: data.codigo_qr, qr_image: data.qr_image });
      setPedidoReferencia("");
      loadAll();
      toast.success("Etiqueta gerada!");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Falha ao gerar etiqueta"));
    } finally {
      setGerandoEtiqueta(false);
    }
  };

  const verQr = async (id: number) => {
    try {
      const { data } = await api.get(`/api/etiquetas/${id}/qrcode`);
      setQrPreview(data);
    } catch {
      toast.error("Falha ao carregar QR");
    }
  };

  const removerEtiqueta = async (id: number) => {
    if (!window.confirm("Remover esta etiqueta?")) return;
    try {
      await api.delete(`/api/etiquetas/${id}`);
      setEtiquetas((prev) => prev.filter((e) => e.id !== id));
      toast.success("Etiqueta removida!");
    } catch {
      toast.error("Falha ao remover etiqueta");
    }
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#424242] mb-1">Produtos & Etiquetas</h1>
          <p className="text-[#717182]">Catálogo esperado no posto de validação e geração de QR Code</p>
        </div>
        <button onClick={loadAll} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-[#717182]" title="Atualizar">
          <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Produtos */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#424242]">Produtos Esperados</h3>
          <button onClick={openAdd} className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Novo Produto
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F5F5F5]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[#424242]">SKU</th>
                <th className="px-4 py-3 text-left font-semibold text-[#424242]">Nome</th>
                <th className="px-4 py-3 text-left font-semibold text-[#424242]">Categoria</th>
                <th className="px-4 py-3 text-left font-semibold text-[#424242]">Peso Esperado</th>
                <th className="px-4 py-3 text-left font-semibold text-[#424242]">Tolerância</th>
                <th className="px-4 py-3 text-left font-semibold text-[#424242]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {produtos.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-[#717182]">Nenhum produto cadastrado ainda.</td></tr>
              ) : produtos.map((p) => (
                <tr key={p.id} className="hover:bg-[#F5F5F5]/50">
                  <td className="px-4 py-3 font-mono text-xs text-[#717182]">{p.sku}</td>
                  <td className="px-4 py-3 font-semibold text-[#424242]">{p.nome}</td>
                  <td className="px-4 py-3 text-[#424242]">{p.categoria || "—"}</td>
                  <td className="px-4 py-3 text-[#424242]">{Number(p.peso_esperado_kg).toFixed(3)} kg</td>
                  <td className="px-4 py-3 text-[#424242]">± {Number(p.tolerancia_kg).toFixed(3)} kg</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(p)} className="p-2 hover:bg-blue-50 rounded-lg transition-colors group" title="Editar">
                        <Edit className="w-4 h-4 text-[#717182] group-hover:text-blue-600" />
                      </button>
                      <button onClick={() => handleDelete(p.id, p.nome)} className="p-2 hover:bg-red-50 rounded-lg transition-colors group" title="Remover">
                        <Trash2 className="w-4 h-4 text-[#717182] group-hover:text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gerar etiqueta */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-6">
        <h3 className="text-lg font-semibold text-[#424242] mb-4 flex items-center gap-2">
          <QrCode className="w-5 h-5 text-[#2E7D32]" /> Gerar Etiqueta (QR Code)
        </h3>
        <div className="flex flex-col md:flex-row gap-3">
          <select value={etiquetaProdutoId} onChange={(e) => setEtiquetaProdutoId(e.target.value)} className="flex-1 px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none text-sm">
            <option value="">Selecione o produto</option>
            {produtos.map((p) => <option key={p.id} value={String(p.id)}>{p.sku} — {p.nome}</option>)}
          </select>
          <input
            type="text" value={pedidoReferencia} onChange={(e) => setPedidoReferencia(e.target.value)}
            placeholder="Referência do pedido (opcional)"
            className="flex-1 px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none text-sm"
          />
          <button onClick={gerarEtiqueta} disabled={gerandoEtiqueta} className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-60">
            {gerandoEtiqueta ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Tags className="w-4 h-4" />}
            Gerar
          </button>
        </div>
      </div>

      {/* Lista de etiquetas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242]">Etiquetas Emitidas</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F5F5F5]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[#424242]">Código QR</th>
                <th className="px-4 py-3 text-left font-semibold text-[#424242]">Produto</th>
                <th className="px-4 py-3 text-left font-semibold text-[#424242]">Pedido</th>
                <th className="px-4 py-3 text-left font-semibold text-[#424242]">Emitida em</th>
                <th className="px-4 py-3 text-left font-semibold text-[#424242]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {etiquetas.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-[#717182]">Nenhuma etiqueta emitida ainda.</td></tr>
              ) : etiquetas.map((e) => (
                <tr key={e.id} className="hover:bg-[#F5F5F5]/50">
                  <td className="px-4 py-3 font-mono text-xs text-[#424242]">{e.codigo_qr}</td>
                  <td className="px-4 py-3 text-[#424242]">{e.produto_nome || "—"}</td>
                  <td className="px-4 py-3 text-[#424242]">{e.pedido_referencia || "—"}</td>
                  <td className="px-4 py-3 text-[#717182]">{new Date(e.criado_em).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => verQr(e.id)} className="p-2 hover:bg-blue-50 rounded-lg transition-colors group" title="Ver QR">
                        <QrCode className="w-4 h-4 text-[#717182] group-hover:text-blue-600" />
                      </button>
                      <button onClick={() => removerEtiqueta(e.id)} className="p-2 hover:bg-red-50 rounded-lg transition-colors group" title="Remover">
                        <Trash2 className="w-4 h-4 text-[#717182] group-hover:text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: novo/editar produto */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#424242]">{editing ? "Editar Produto" : "Novo Produto"}</h2>
              <button onClick={() => !saving && setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-[#717182]" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">SKU <span className="text-red-500">*</span></label>
                <input type="text" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="Ex: SKU-1004" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">Nome <span className="text-red-500">*</span></label>
                <input type="text" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Kit de Engrenagens A" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">Categoria</label>
                <input type="text" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} placeholder="Ex: Componentes Mecânicos" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-1.5">Peso Esperado (kg) <span className="text-red-500">*</span></label>
                  <input type="text" inputMode="decimal" value={form.peso_esperado_kg} onChange={(e) => setForm((f) => ({ ...f, peso_esperado_kg: e.target.value }))} placeholder="2,500" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-1.5">Tolerância (kg)</label>
                  <input type="text" inputMode="decimal" value={form.tolerancia_kg} onChange={(e) => setForm((f) => ({ ...f, tolerancia_kg: e.target.value }))} placeholder="0,050" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => !saving && setShowModal(false)} disabled={saving} className="flex-1 px-4 py-3 rounded-lg border border-gray-200 text-[#424242] font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-3 rounded-lg bg-[#2E7D32] text-white font-medium hover:bg-[#1B5E20] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Salvando...</> : (editing ? "Salvar Alterações" : "Cadastrar Produto")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: preview do QR */}
      {qrPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setQrPreview(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8 text-center">
            <button onClick={() => setQrPreview(null)} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5 text-[#717182]" />
            </button>
            <h2 className="text-lg font-bold text-[#424242] mb-4">Etiqueta QR Code</h2>
            <img src={qrPreview.qr_image} alt="QR Code" className="mx-auto rounded-lg border border-gray-100 mb-3" />
            <p className="font-mono text-xs text-[#717182] break-all mb-4">{qrPreview.codigo_qr}</p>
            <button onClick={() => window.print()} className="w-full bg-[#2E7D32] hover:bg-[#1B5E20] text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 text-sm">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
