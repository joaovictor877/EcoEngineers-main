import { useState, useEffect } from "react";
import { Factory, Package, Warehouse, Recycle, Trash2, ArrowRight, Brain, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

interface Residuo {
  id: number;
  material_name: string;
  material_category: string;
  peso: number;
  setor_origem: string;
  destino: string;
  status: string;
  observacao: string;
  analise_ia_id: number | null;
  criado_em: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "producao":       return "bg-blue-100 text-blue-700";
    case "separacao":      return "bg-yellow-100 text-yellow-700";
    case "armazenamento":  return "bg-purple-100 text-purple-700";
    case "reaproveitamento": return "bg-green-100 text-green-700";
    case "descarte":       return "bg-red-100 text-red-600";
    default:               return "bg-gray-100 text-gray-700";
  }
};

const STATUS_LABEL: Record<string, string> = {
  producao: "ProduÃ§Ã£o",
  separacao: "SeparaÃ§Ã£o",
  armazenamento: "Armazenamento",
  reaproveitamento: "Reaproveitamento",
  descarte: "Descarte",
};

const DESTINO_LABEL: Record<string, string> = {
  reaproveitamento: "Reaproveitamento Interno",
  reciclagem: "Reciclagem Externa",
  descarte: "Descarte Controlado",
  venda: "Venda para Terceiros",
};

export function TrackingMaterial() {
  const [residuos, setResiduos] = useState<Residuo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data } = await api.get<Residuo[]>("/api/residuos");
      setResiduos(data);
    } catch {
      toast.error("Falha ao carregar rastreamento");
    } finally {
      setLoading(false);
    }
  }

  const totalPeso = residuos.reduce((s, r) => s + Number(r.peso || 0), 0);
  const reaproveitados = residuos.filter((r) => r.status === "reaproveitamento").length;
  const iaDetectados   = residuos.filter((r) => r.analise_ia_id).length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#424242] mb-1">Rastreamento de Material</h1>
          <p className="text-[#717182]">Visualize o fluxo da logÃ­stica reversa</p>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-[#717182]"
          title="Atualizar"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center gap-4">
          <div className="bg-[#2E7D32]/10 p-3 rounded-xl">
            <Package className="w-6 h-6 text-[#2E7D32]" />
          </div>
          <div>
            <p className="text-sm text-[#717182]">Total Registrado</p>
            <p className="text-2xl font-bold text-[#424242]">{residuos.length} <span className="text-base font-normal text-[#717182]">registros</span></p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center gap-4">
          <div className="bg-green-100 p-3 rounded-xl">
            <Recycle className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-[#717182]">Peso Total</p>
            <p className="text-2xl font-bold text-[#424242]">
              {totalPeso.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} <span className="text-base font-normal text-[#717182]">kg</span>
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center gap-4">
          <div className="bg-purple-100 p-3 rounded-xl">
            <Brain className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-[#717182]">Detectados por IA</p>
            <p className="text-2xl font-bold text-[#424242]">{iaDetectados} <span className="text-base font-normal text-[#717182]">de {residuos.length}</span></p>
          </div>
        </div>
      </div>

      {/* Flow Diagram */}
      <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 mb-8">
        <h3 className="text-lg font-semibold text-[#424242] mb-6">Fluxo da LogÃ­stica Reversa</h3>
        <div className="flex items-center justify-between">
          {[
            { icon: Factory,   label: "ProduÃ§Ã£o",        sub: "GeraÃ§Ã£o de resÃ­duos",    count: residuos.filter(r=>r.status==="producao").length },
            { icon: Package,   label: "SeparaÃ§Ã£o",       sub: "ClassificaÃ§Ã£o por tipo",  count: residuos.filter(r=>r.status==="separacao").length },
            { icon: Warehouse, label: "Armazenamento",   sub: "Estoque temporÃ¡rio",      count: residuos.filter(r=>r.status==="armazenamento").length },
            { icon: Recycle,   label: "Reaproveitamento",sub: "ou Descarte",             count: reaproveitados },
          ].map(({ icon: Icon, label, sub, count }, i, arr) => (
            <div key={label} className="flex items-center flex-1">
              <div className="flex flex-col items-center text-center flex-1">
                <div className="w-16 h-16 bg-[#2E7D32]/10 rounded-full flex items-center justify-center mb-3">
                  <Icon className="w-8 h-8 text-[#2E7D32]" />
                </div>
                <h4 className="font-semibold text-[#424242] mb-0.5">{label}</h4>
                <p className="text-xs text-[#717182]">{sub}</p>
                {count > 0 && (
                  <span className="mt-1.5 text-xs bg-[#2E7D32] text-white px-2 py-0.5 rounded-full font-medium">{count}</span>
                )}
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-6 h-6 text-[#66BB6A] flex-shrink-0 mx-2" />}
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242]">
            Materiais em Rastreamento
            <span className="ml-2 text-sm font-normal text-[#717182]">({residuos.length} registros)</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F5F5F5]">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">ID</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Material</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Peso (kg)</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Setor</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Destino</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">IA</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : residuos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-[#717182]">
                    Nenhum resÃ­duo registrado ainda. Use a pÃ¡gina "Registro de ResÃ­duos" para comeÃ§ar.
                  </td>
                </tr>
              ) : (
                residuos.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F5F5F5]/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm text-[#717182]">#{String(r.id).padStart(4, "0")}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-semibold text-[#424242]">{r.material_name || "â€”"}</p>
                        {r.material_category && (
                          <p className="text-xs text-[#717182]">{r.material_category}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-[#424242]">
                        {Number(r.peso || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-[#424242] capitalize">{r.setor_origem || "â€”"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(r.status)}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-[#424242]">
                        {DESTINO_LABEL[r.destino] || r.destino || "â€”"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {r.analise_ia_id ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          <Brain className="w-3 h-3" /> IA
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Manual</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-[#717182]">
                        {r.criado_em ? new Date(r.criado_em).toLocaleDateString("pt-BR") : "â€”"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
