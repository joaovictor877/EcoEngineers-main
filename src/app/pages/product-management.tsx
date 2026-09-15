import { useEffect, useState } from "react";
import {
  Plus, Edit, Trash2, RefreshCw, Tags, QrCode, X, Printer, Package, Search,
} from "lucide-react";
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
  produto_peso_esperado_kg: number | null;
  produto_tolerancia_kg: number | null;
  criado_em: string;
}

interface Material {
  id: number;
  name: string;
  category: string;
  unit: string;
  valor_unitario_kg: number;
  custo_reaproveitamento_kg: number;
  created_at: string;
}

interface LabelPrintItem {
  produto_nome: string | null;
  produto_sku: string | null;
  peso_esperado_kg: number | null;
  tolerancia_kg: number | null;
  pedido_referencia: string | null;
  codigo_qr: string;
  qr_image: string;
  emitida_em: string;
}

const MATERIAL_CATEGORIES = [
  "Metal Ferroso", "Metal Não Ferroso", "Metal Misto", "Papel/Papelão",
  "Plástico", "Madeira", "Borracha", "Vidro", "Eletrônico", "Outros",
];
const MATERIAL_UNITS = ["kg", "g", "ton", "unidade", "L", "m²", "m³"];
const MATERIAL_CATEGORY_COLORS: Record<string, string> = {
  "Metal Ferroso":     "bg-orange-100 text-orange-700",
  "Metal Não Ferroso": "bg-blue-100 text-blue-700",
  "Metal Misto":       "bg-purple-100 text-purple-700",
  "Papel/Papelão":     "bg-yellow-100 text-yellow-700",
  "Plástico":          "bg-red-100 text-red-700",
  "Madeira":           "bg-amber-100 text-amber-700",
  "Borracha":          "bg-stone-100 text-stone-700",
  "Vidro":             "bg-cyan-100 text-cyan-700",
  "Eletrônico":        "bg-indigo-100 text-indigo-700",
  "Outros":            "bg-gray-100 text-gray-600",
  "Metal":             "bg-slate-100 text-slate-700",
};

export function ProductManagement() {
  const [tab, setTab] = useState<"produtos" | "materiais" | "etiquetas">("produtos");

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ sku: "", nome: "", categoria: "", peso_esperado_kg: "", tolerancia_kg: "0.05" });

  const [etiquetaProdutoId, setEtiquetaProdutoId] = useState("");
  const [pedidoReferencia, setPedidoReferencia] = useState("");
  const [quantidadeEtiquetas, setQuantidadeEtiquetas] = useState("1");
  const [gerandoEtiqueta, setGerandoEtiqueta] = useState(false);
  const [reimprimindoId, setReimprimindoId] = useState<number | null>(null);

  const [materialSearch, setMaterialSearch] = useState("");
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [materialForm, setMaterialForm] = useState({
    name: "", category: "Metal Ferroso", unit: "kg", valor_unitario_kg: "", custo_reaproveitamento_kg: "",
  });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [p, e, m] = await Promise.all([
        api.get<Produto[]>("/api/produtos"),
        api.get<Etiqueta[]>("/api/etiquetas"),
        api.get<Material[]>("/api/materials"),
      ]);
      setProdutos(p.data);
      setEtiquetas(e.data);
      setMaterials(m.data);
      if (p.data[0] && !etiquetaProdutoId) setEtiquetaProdutoId(String(p.data[0].id));
    } catch {
      toast.error("Falha ao carregar produtos, materiais e etiquetas");
    } finally {
      setLoading(false);
    }
  }

  const getApiErrorMessage = (error: unknown, fallback: string) =>
    (error as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

  // ── Produtos ────────────────────────────────────────────────
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

  // ── Materiais ───────────────────────────────────────────────
  const materialsFiltered = materials.filter(
    (m) =>
      m.name.toLowerCase().includes(materialSearch.toLowerCase()) ||
      (m.category || "").toLowerCase().includes(materialSearch.toLowerCase())
  );
  const materialCategoryColor = (cat: string) => MATERIAL_CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-600";

  const openAddMaterial = () => {
    setEditingMaterial(null);
    setMaterialForm({ name: "", category: "Metal Ferroso", unit: "kg", valor_unitario_kg: "", custo_reaproveitamento_kg: "" });
    setShowMaterialModal(true);
  };

  const openEditMaterial = (m: Material) => {
    setEditingMaterial(m);
    setMaterialForm({
      name: m.name, category: m.category || "Metal Ferroso", unit: m.unit || "kg",
      valor_unitario_kg: String(m.valor_unitario_kg ?? ""), custo_reaproveitamento_kg: String(m.custo_reaproveitamento_kg ?? ""),
    });
    setShowMaterialModal(true);
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialForm.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSavingMaterial(true);
    const payload = {
      ...materialForm,
      valor_unitario_kg: Number(materialForm.valor_unitario_kg.replace(",", ".")) || 0,
      custo_reaproveitamento_kg: Number(materialForm.custo_reaproveitamento_kg.replace(",", ".")) || 0,
    };
    try {
      if (editingMaterial) {
        const { data } = await api.put<Material>(`/api/materials/${editingMaterial.id}`, payload);
        setMaterials((prev) => prev.map((m) => (m.id === editingMaterial.id ? data : m)));
        toast.success("Material atualizado com sucesso!");
      } else {
        const { data } = await api.post<Material>("/api/materials", payload);
        setMaterials((prev) => [...prev, data]);
        toast.success("Material adicionado com sucesso!");
      }
      setShowMaterialModal(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Falha ao salvar material"));
    } finally {
      setSavingMaterial(false);
    }
  };

  const handleDeleteMaterial = async (id: number, name: string) => {
    if (!window.confirm(`Remover o material "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/api/materials/${id}`);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      toast.success("Material removido com sucesso!");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Falha ao remover material"));
    }
  };

  // ── Etiquetas ───────────────────────────────────────────────
  // Monta e abre uma janela de impressão com N etiquetas em grade — mesmo
  // padrão de reports.tsx (window.open + HTML/CSS próprios + window.print()).
  const imprimirEtiquetas = (items: LabelPrintItem[]) => {
    const win = window.open("", "_blank");
    if (!win) { toast.error("Popup bloqueado. Permita popups e tente novamente."); return; }
    const cards = items.map((it) => `
      <div class="label">
        <div class="label-header">EcoEngineers — Etiqueta de Expedição</div>
        <div class="label-produto">${it.produto_nome || "Produto não identificado"}</div>
        <div class="label-sku">${it.produto_sku || "—"}</div>
        <div class="label-row">
          <span>Peso esperado: <strong>${it.peso_esperado_kg !== null ? `${Number(it.peso_esperado_kg).toFixed(3)} kg ± ${Number(it.tolerancia_kg ?? 0).toFixed(3)} kg` : "—"}</strong></span>
        </div>
        <div class="label-row">Pedido: <strong>${it.pedido_referencia || "—"}</strong></div>
        <img class="label-qr" src="${it.qr_image}" alt="QR Code" />
        <div class="label-codigo">${it.codigo_qr}</div>
        <div class="label-data">Emitida em ${new Date(it.emitida_em).toLocaleString("pt-BR")}</div>
      </div>`).join("");
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Etiquetas EcoEngineers</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #333; margin: 16px; }
  .grid { display: flex; flex-wrap: wrap; gap: 12px; }
  .label {
    width: 320px; border: 1px dashed #999; border-radius: 8px; padding: 14px;
    text-align: center; page-break-inside: avoid;
  }
  .label-header { font-size: 10px; color: #2E7D32; font-weight: bold; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
  .label-produto { font-size: 16px; font-weight: bold; color: #222; }
  .label-sku { font-size: 12px; color: #666; margin-bottom: 8px; }
  .label-row { font-size: 12px; color: #444; margin-bottom: 4px; }
  .label-qr { width: 140px; height: 140px; margin: 8px auto; display: block; }
  .label-codigo { font-family: monospace; font-size: 10px; color: #666; word-break: break-all; }
  .label-data { font-size: 10px; color: #999; margin-top: 6px; }
  @media print { body { margin: 0; } .label { border-style: solid; } }
</style></head><body>
<div class="grid">${cards}</div>
<script>window.onload=()=>{ window.print(); };</script>
</body></html>`);
    win.document.close();
  };

  const gerarEtiqueta = async () => {
    if (!etiquetaProdutoId) { toast.error("Selecione um produto"); return; }
    const quantidade = Math.max(1, Math.min(100, parseInt(quantidadeEtiquetas, 10) || 1));
    const produto = produtos.find((p) => String(p.id) === etiquetaProdutoId);
    setGerandoEtiqueta(true);
    try {
      const gerados: LabelPrintItem[] = [];
      for (let i = 0; i < quantidade; i++) {
        const { data } = await api.post("/api/etiquetas", {
          produto_id: Number(etiquetaProdutoId),
          pedido_referencia: pedidoReferencia.trim() || null,
        });
        gerados.push({
          produto_nome: produto?.nome ?? null,
          produto_sku: produto?.sku ?? null,
          peso_esperado_kg: produto?.peso_esperado_kg ?? null,
          tolerancia_kg: produto?.tolerancia_kg ?? null,
          pedido_referencia: data.pedido_referencia,
          codigo_qr: data.codigo_qr,
          qr_image: data.qr_image,
          emitida_em: data.criado_em || new Date().toISOString(),
        });
      }
      toast.success(quantidade > 1 ? `${quantidade} etiquetas geradas!` : "Etiqueta gerada!");
      setPedidoReferencia("");
      setQuantidadeEtiquetas("1");
      loadAll();
      imprimirEtiquetas(gerados);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Falha ao gerar etiqueta"));
    } finally {
      setGerandoEtiqueta(false);
    }
  };

  const reimprimirEtiqueta = async (etiqueta: Etiqueta) => {
    setReimprimindoId(etiqueta.id);
    try {
      const { data } = await api.get(`/api/etiquetas/${etiqueta.id}/qrcode`);
      imprimirEtiquetas([{
        produto_nome: etiqueta.produto_nome,
        produto_sku: etiqueta.produto_sku,
        peso_esperado_kg: etiqueta.produto_peso_esperado_kg,
        tolerancia_kg: etiqueta.produto_tolerancia_kg,
        pedido_referencia: etiqueta.pedido_referencia,
        codigo_qr: data.codigo_qr,
        qr_image: data.qr_image,
        emitida_em: etiqueta.criado_em,
      }]);
    } catch {
      toast.error("Falha ao carregar etiqueta para impressão");
    } finally {
      setReimprimindoId(null);
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#424242] mb-1">Cadastros</h1>
          <p className="text-[#717182]">Produtos, materiais e etiquetas usados no posto de validação</p>
        </div>
        <button onClick={loadAll} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-[#717182]" title="Atualizar">
          <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-white rounded-xl border border-gray-100 p-1.5 w-fit">
        <button onClick={() => setTab("produtos")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${tab === "produtos" ? "bg-[#2E7D32] text-white" : "text-[#717182] hover:bg-gray-50"}`}>
          <Tags className="w-4 h-4" /> Produtos
        </button>
        <button onClick={() => setTab("materiais")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${tab === "materiais" ? "bg-[#2E7D32] text-white" : "text-[#717182] hover:bg-gray-50"}`}>
          <Package className="w-4 h-4" /> Materiais
        </button>
        <button onClick={() => setTab("etiquetas")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${tab === "etiquetas" ? "bg-[#2E7D32] text-white" : "text-[#717182] hover:bg-gray-50"}`}>
          <QrCode className="w-4 h-4" /> Etiquetas
        </button>
      </div>

      {tab === "produtos" && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
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
      )}

      {tab === "materiais" && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex flex-col md:flex-row gap-4 justify-between mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#717182]" />
              <input
                type="text" value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)}
                placeholder="Buscar por nome ou categoria..."
                className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none text-sm"
              />
            </div>
            <button onClick={openAddMaterial} className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-4 py-2 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 text-sm whitespace-nowrap">
              <Plus className="w-4 h-4" /> Adicionar Material
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F5F5]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-[#424242]">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#424242]">Categoria</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#424242]">Unidade</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#424242]">Valor de Mercado</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#424242]">Custo Reaproveitamento</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#424242]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materialsFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-[#717182]">
                      {materialSearch ? "Nenhum material encontrado para a busca." : "Nenhum material cadastrado ainda."}
                    </td>
                  </tr>
                ) : materialsFiltered.map((m) => (
                  <tr key={m.id} className="hover:bg-[#F5F5F5]/50">
                    <td className="px-4 py-3 font-semibold text-[#424242]">{m.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${materialCategoryColor(m.category)}`}>
                        {m.category || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#2E7D32]/10 text-[#2E7D32]">{m.unit || "kg"}</span>
                    </td>
                    <td className="px-4 py-3 text-[#424242]">R$ {Number(m.valor_unitario_kg || 0).toFixed(2)}/kg</td>
                    <td className="px-4 py-3 text-[#424242]">R$ {Number(m.custo_reaproveitamento_kg || 0).toFixed(2)}/kg</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEditMaterial(m)} className="p-2 hover:bg-blue-50 rounded-lg transition-colors group" title="Editar">
                          <Edit className="w-4 h-4 text-[#717182] group-hover:text-blue-600" />
                        </button>
                        <button onClick={() => handleDeleteMaterial(m.id, m.name)} className="p-2 hover:bg-red-50 rounded-lg transition-colors group" title="Remover">
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
      )}

      {tab === "etiquetas" && (
        <>
          {/* Gerar etiqueta */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-6">
            <h3 className="text-lg font-semibold text-[#424242] mb-1 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-[#2E7D32]" /> Gerar Etiquetas (QR Code)
            </h3>
            <p className="text-xs text-[#717182] mb-4">Gere em lote para o processo de embalagem do dia anterior ao envio — abre pronto para impressão.</p>
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
              <input
                type="number" min={1} max={100} value={quantidadeEtiquetas}
                onChange={(e) => setQuantidadeEtiquetas(e.target.value)}
                title="Quantidade de etiquetas"
                className="w-full md:w-28 px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none text-sm"
              />
              <button onClick={gerarEtiqueta} disabled={gerandoEtiqueta} className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-60 whitespace-nowrap">
                {gerandoEtiqueta ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                Gerar e Imprimir
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
                          <button onClick={() => reimprimirEtiqueta(e)} disabled={reimprimindoId === e.id} className="p-2 hover:bg-blue-50 rounded-lg transition-colors group disabled:opacity-60" title="Imprimir etiqueta">
                            {reimprimindoId === e.id ? <RefreshCw className="w-4 h-4 text-[#717182] animate-spin" /> : <Printer className="w-4 h-4 text-[#717182] group-hover:text-blue-600" />}
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
        </>
      )}

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

      {/* Modal: novo/editar material */}
      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !savingMaterial && setShowMaterialModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-[#424242]">{editingMaterial ? "Editar Material" : "Novo Material"}</h2>
                <p className="text-sm text-[#717182] mt-0.5">{editingMaterial ? "Atualize os dados do material" : "Preencha os dados para cadastrar"}</p>
              </div>
              <button onClick={() => !savingMaterial && setShowMaterialModal(false)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-[#717182]" />
              </button>
            </div>
            <form onSubmit={handleSaveMaterial} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">Nome do Material <span className="text-red-500">*</span></label>
                <input type="text" value={materialForm.name} onChange={(e) => setMaterialForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Cavaco de Aço" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">Categoria <span className="text-red-500">*</span></label>
                <select value={materialForm.category} onChange={(e) => setMaterialForm((f) => ({ ...f, category: e.target.value }))} className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm bg-white">
                  {MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">Unidade de Medida</label>
                <select value={materialForm.unit} onChange={(e) => setMaterialForm((f) => ({ ...f, unit: e.target.value }))} className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm bg-white">
                  {MATERIAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-1.5">Valor de Mercado (R$/kg)</label>
                  <input type="text" inputMode="decimal" value={materialForm.valor_unitario_kg} onChange={(e) => setMaterialForm((f) => ({ ...f, valor_unitario_kg: e.target.value }))} placeholder="0,00" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#424242] mb-1.5">Custo de Reaproveitamento (R$/kg)</label>
                  <input type="text" inputMode="decimal" value={materialForm.custo_reaproveitamento_kg} onChange={(e) => setMaterialForm((f) => ({ ...f, custo_reaproveitamento_kg: e.target.value }))} placeholder="0,00" className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
                </div>
              </div>
              <p className="text-xs text-[#717182] -mt-2">Usados para calcular prejuízo no descarte e economia líquida no reaproveitamento.</p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => !savingMaterial && setShowMaterialModal(false)} disabled={savingMaterial} className="flex-1 px-4 py-3 rounded-lg border border-gray-200 text-[#424242] font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
                  Cancelar
                </button>
                <button type="submit" disabled={savingMaterial} className="flex-1 px-4 py-3 rounded-lg bg-[#2E7D32] text-white font-medium hover:bg-[#1B5E20] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingMaterial ? <><RefreshCw className="w-4 h-4 animate-spin" /> Salvando...</> : (editingMaterial ? "Salvar Alterações" : "Adicionar Material")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
