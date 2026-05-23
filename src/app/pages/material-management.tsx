import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Search, X, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

interface Material {
  id: number;
  name: string;
  category: string;
  unit: string;
  created_at: string;
}

const CATEGORIES = [
  "Metal Ferroso",
  "Metal Não Ferroso",
  "Metal Misto",
  "Papel/Papelão",
  "Plástico",
  "Madeira",
  "Borracha",
  "Vidro",
  "Eletrônico",
  "Outros",
];

const UNITS = ["kg", "g", "ton", "unidade", "L", "m²", "m³"];

const CATEGORY_COLORS: Record<string, string> = {
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

export function MaterialManagement() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", category: "Metal Ferroso", unit: "kg" });

  useEffect(() => { loadMaterials(); }, []);

  async function loadMaterials() {
    setLoading(true);
    try {
      const { data } = await api.get<Material[]>("/api/materials");
      setMaterials(data);
    } catch {
      toast.error("Falha ao carregar materiais");
    } finally {
      setLoading(false);
    }
  }

  const filtered = materials.filter(
    (m) =>
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.category || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", category: "Metal Ferroso", unit: "kg" });
    setShowModal(true);
  };

  const openEdit = (m: Material) => {
    setEditing(m);
    setForm({ name: m.name, category: m.category || "Metal Ferroso", unit: m.unit || "kg" });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      if (editing) {
        const { data } = await api.put<Material>(`/api/materials/${editing.id}`, form);
        setMaterials((prev) => prev.map((m) => (m.id === editing.id ? data : m)));
        toast.success("Material atualizado com sucesso!");
      } else {
        const { data } = await api.post<Material>("/api/materials", form);
        setMaterials((prev) => [...prev, data]);
        toast.success("Material adicionado com sucesso!");
      }
      setShowModal(false);
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Falha ao salvar material");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Remover o material "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/api/materials/${id}`);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
      toast.success("Material removido com sucesso!");
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Falha ao remover material");
    }
  };

  const categoryColor = (cat: string) =>
    CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-600";

  const uniqueCategories = Array.from(new Set(materials.map((m) => m.category).filter(Boolean)));

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#424242] mb-1">Gestão de Materiais</h1>
          <p className="text-[#717182]">Cadastro e gerenciamento de materiais recicláveis</p>
        </div>
        <button
          onClick={loadMaterials}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-[#717182]"
          title="Atualizar lista"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="bg-[#2E7D32]/10 p-3 rounded-xl">
              <Package className="w-6 h-6 text-[#2E7D32]" />
            </div>
            <div>
              <p className="text-sm text-[#717182]">Total de Materiais</p>
              <p className="text-2xl font-bold text-[#424242]">{materials.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-3 rounded-xl">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-[#717182]">Categorias Distintas</p>
              <p className="text-2xl font-bold text-[#424242]">{uniqueCategories.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="bg-orange-100 p-3 rounded-xl">
              <Package className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-[#717182]">Metais Cadastrados</p>
              <p className="text-2xl font-bold text-[#424242]">
                {materials.filter((m) => (m.category || "").toLowerCase().includes("metal")).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-6">
        <div className="flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#717182]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome ou categoria..."
              className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
            />
          </div>
          <button
            onClick={openAdd}
            className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-6 py-3 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-5 h-5" />
            Adicionar Material
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F5F5F5]">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">ID</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Nome do Material</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Categoria</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Unidade</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Data de Cadastro</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-[#717182]">
                    {searchTerm ? "Nenhum material encontrado para a busca." : "Nenhum material cadastrado. Clique em \"Adicionar Material\" para começar."}
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-[#F5F5F5]/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm text-[#717182]">
                        #{String(m.id).padStart(3, "0")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-[#424242]">{m.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${categoryColor(m.category)}`}>
                        {m.category || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#2E7D32]/10 text-[#2E7D32]">
                        {m.unit || "kg"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#717182]">
                      {m.created_at ? new Date(m.created_at).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(m)}
                          className="p-2 hover:bg-blue-50 rounded-lg transition-colors group"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4 text-[#717182] group-hover:text-blue-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(m.id, m.name)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors group"
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4 text-[#717182] group-hover:text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-[#424242]">
                  {editing ? "Editar Material" : "Novo Material"}
                </h2>
                <p className="text-sm text-[#717182] mt-0.5">
                  {editing ? "Atualize os dados do material" : "Preencha os dados para cadastrar"}
                </p>
              </div>
              <button
                onClick={() => !saving && setShowModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-[#717182]" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">
                  Nome do Material <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Cavaco de Aço"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm"
                  autoFocus
                />
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">
                  Categoria <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm bg-white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Unidade */}
              <div>
                <label className="block text-sm font-medium text-[#424242] mb-1.5">
                  Unidade de Medida
                </label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm bg-white"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              {/* Preview badge */}
              {form.category && (
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-[#717182]">Pré-visualização:</span>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${categoryColor(form.category)}`}>
                    {form.category}
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#2E7D32]/10 text-[#2E7D32]">
                    {form.unit}
                  </span>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => !saving && setShowModal(false)}
                  disabled={saving}
                  className="flex-1 px-4 py-3 rounded-lg border border-gray-200 text-[#424242] font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-3 rounded-lg bg-[#2E7D32] text-white font-medium hover:bg-[#1B5E20] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Salvando...</>
                  ) : (
                    editing ? "Salvar Alterações" : "Adicionar Material"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
