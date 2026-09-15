import { useState, useEffect } from "react";
import {
  Factory, Package, Warehouse, Recycle, Trash2, ArrowRight, Brain, RefreshCw,
  ScanLine, CheckCircle2, XCircle, AlertTriangle, Truck, CheckCheck,
} from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { socket } from "../lib/socket";

interface Validacao {
  id: number;
  resultado: "aprovado" | "reprovado";
  motivo_divergencia: string | null;
  peso_medido: number | null;
  qrcode_lido: string | null;
  produto_nome: string | null;
  produto_sku: string | null;
  criado_em: string;
  resolvido: number | boolean;
  resolvido_em: string | null;
  status_entrega: "expedido" | "entregue";
  entregue_em: string | null;
}

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
  prejuizo_descarte: number;
  custo_reaproveitamento: number;
  valor_economizado: number;
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
  producao: "Produção",
  separacao: "Separação",
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
  const [tab, setTab] = useState<"validacoes" | "residuos">("validacoes");
  const [residuos, setResiduos] = useState<Residuo[]>([]);
  const [validacoes, setValidacoes] = useState<Validacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvendoId, setResolvendoId] = useState<number | null>(null);
  const [entregandoId, setEntregandoId] = useState<number | null>(null);

  useEffect(() => { loadData(); }, []);

  // Alertas em tempo real: uma reprovação nova avisa quem estiver com a
  // página de Rastreamento aberta, sem precisar atualizar manualmente.
  useEffect(() => {
    socket.connect();

    const upsert = (v: Validacao) => {
      setValidacoes((prev) => {
        const idx = prev.findIndex((p) => p.id === v.id);
        if (idx === -1) return [v, ...prev];
        const next = [...prev];
        next[idx] = { ...next[idx], ...v };
        return next;
      });
    };

    const onValidacao = (data: Validacao) => {
      upsert(data);
      if (data.resultado === "reprovado") {
        toast.error(`❌ Problema detectado na expedição — ${data.produto_nome || "item"}: ${data.motivo_divergencia || "verifique"}`);
      }
    };

    socket.on("validacao_concluida", onValidacao);
    socket.on("validacao_resolvida", upsert);
    socket.on("validacao_entregue", upsert);

    return () => {
      socket.off("validacao_concluida", onValidacao);
      socket.off("validacao_resolvida", upsert);
      socket.off("validacao_entregue", upsert);
      socket.disconnect();
    };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [r, v] = await Promise.all([
        api.get<Residuo[]>("/api/residuos"),
        api.get<Validacao[]>("/api/validacoes"),
      ]);
      setResiduos(r.data);
      setValidacoes(v.data);
    } catch {
      toast.error("Falha ao carregar rastreamento");
    } finally {
      setLoading(false);
    }
  }

  async function resolverValidacao(id: number) {
    setResolvendoId(id);
    try {
      const { data } = await api.put<Validacao>(`/api/validacoes/${id}/resolver`);
      setValidacoes((prev) => prev.map((v) => (v.id === id ? { ...v, ...data } : v)));
      toast.success("Problema marcado como resolvido.");
    } catch {
      toast.error("Falha ao marcar como resolvido");
    } finally {
      setResolvendoId(null);
    }
  }

  async function marcarEntregue(id: number) {
    setEntregandoId(id);
    try {
      const { data } = await api.put<Validacao>(`/api/validacoes/${id}/entregar`);
      setValidacoes((prev) => prev.map((v) => (v.id === id ? { ...v, ...data } : v)));
      toast.success("Item marcado como entregue.");
    } catch {
      toast.error("Falha ao marcar como entregue");
    } finally {
      setEntregandoId(null);
    }
  }

  const problemasAbertos = validacoes.filter((v) => v.resultado === "reprovado" && !v.resolvido);

  const totalPeso = residuos.reduce((s, r) => s + Number(r.peso || 0), 0);
  const reaproveitados = residuos.filter((r) => r.status === "reaproveitamento").length;
  const iaDetectados   = residuos.filter((r) => r.analise_ia_id).length;

  const aprovadas = validacoes.filter((v) => v.resultado === "aprovado").length;
  const reprovadas = validacoes.filter((v) => v.resultado === "reprovado").length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#424242] mb-1">Validação de Expedição</h1>
          <p className="text-[#717182]">Empacotamento → validação → envio — acompanhe e corrija antes de expedir</p>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-[#717182]"
          title="Atualizar"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Alerta de problemas em aberto — sempre visível, mesmo fora da aba de validações */}
      {problemasAbertos.length > 0 && (
        <div className="mb-8 bg-red-50 border border-red-300 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-red-100/70 border-b border-red-200">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <h3 className="font-semibold text-red-800">
              {problemasAbertos.length} {problemasAbertos.length === 1 ? "problema detectado" : "problemas detectados"} — corrija antes de enviar
            </h3>
          </div>
          <ul className="divide-y divide-red-100">
            {problemasAbertos.map((v) => (
              <li key={v.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-red-800">
                    {v.produto_nome || "Item não identificado"}
                    {v.produto_sku && <span className="font-normal text-red-700/80"> · {v.produto_sku}</span>}
                  </p>
                  <p className="text-xs text-red-700 mt-0.5">{v.motivo_divergencia || "Verifique este item."}</p>
                  <p className="text-xs text-red-600/70 mt-0.5">{new Date(v.criado_em).toLocaleString("pt-BR")}</p>
                </div>
                <button
                  onClick={() => resolverValidacao(v.id)}
                  disabled={resolvendoId === v.id}
                  className="self-start md:self-center bg-white hover:bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-60 flex-shrink-0"
                >
                  {resolvendoId === v.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                  Marcar como resolvido
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-8 bg-white rounded-xl border border-gray-100 p-1.5 w-fit">
        <button
          onClick={() => setTab("validacoes")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === "validacoes" ? "bg-[#2E7D32] text-white" : "text-[#717182] hover:bg-gray-50"
          }`}
        >
          <ScanLine className="w-4 h-4" /> Validações de Expedição
        </button>
        <button
          onClick={() => setTab("residuos")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === "residuos" ? "bg-[#2E7D32] text-white" : "text-[#717182] hover:bg-gray-50"
          }`}
        >
          <Recycle className="w-4 h-4" /> Resíduos
        </button>
      </div>

      {tab === "validacoes" && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center gap-4">
              <div className="bg-[#2E7D32]/10 p-3 rounded-xl">
                <ScanLine className="w-6 h-6 text-[#2E7D32]" />
              </div>
              <div>
                <p className="text-sm text-[#717182]">Total Validado</p>
                <p className="text-2xl font-bold text-[#424242]">{validacoes.length} <span className="text-base font-normal text-[#717182]">itens</span></p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center gap-4">
              <div className="bg-green-100 p-3 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-[#717182]">Aprovados</p>
                <p className="text-2xl font-bold text-[#424242]">{aprovadas}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center gap-4">
              <div className="bg-red-100 p-3 rounded-xl">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-[#717182]">Reprovados</p>
                <p className="text-2xl font-bold text-[#424242]">{reprovadas}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-[#424242]">
                Histórico de Validações
                <span className="ml-2 text-sm font-normal text-[#717182]">({validacoes.length} registros)</span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F5F5F5]">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">ID</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Produto</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">QR Lido</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Peso (kg)</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Resultado</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Motivo</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Envio</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-6 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  ) : validacoes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-[#717182]">
                        Nenhuma validação registrada ainda. Use a página "Posto de Validação" para começar.
                      </td>
                    </tr>
                  ) : (
                    validacoes.map((v) => {
                      const problemaAberto = v.resultado === "reprovado" && !v.resolvido;
                      return (
                      <tr key={v.id} className={`transition-colors ${problemaAberto ? "bg-red-50 hover:bg-red-100/70" : "hover:bg-[#F5F5F5]/50"}`}>
                        <td className="px-6 py-4"><span className="font-mono text-sm text-[#717182]">#{String(v.id).padStart(4, "0")}</span></td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-[#424242]">{v.produto_nome || "—"}</p>
                          {v.produto_sku && <p className="text-xs text-[#717182]">{v.produto_sku}</p>}
                        </td>
                        <td className="px-6 py-4"><span className="font-mono text-xs text-[#717182] break-all">{v.qrcode_lido || "—"}</span></td>
                        <td className="px-6 py-4"><span className="text-sm font-medium text-[#424242]">{v.peso_medido?.toFixed(3) ?? "—"}</span></td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${v.resultado === "aprovado" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                            {v.resultado === "aprovado" ? "Aprovado" : "Reprovado"}
                          </span>
                          {v.resultado === "reprovado" && (
                            v.resolvido ? (
                              <span className="block mt-1 text-xs text-green-600">✓ resolvido</span>
                            ) : (
                              <button
                                onClick={() => resolverValidacao(v.id)}
                                disabled={resolvendoId === v.id}
                                className="block mt-1 text-xs text-red-700 underline hover:text-red-800 disabled:opacity-60"
                              >
                                marcar resolvido
                              </button>
                            )
                          )}
                        </td>
                        <td className="px-6 py-4"><span className="text-xs text-[#717182]">{v.motivo_divergencia || "—"}</span></td>
                        <td className="px-6 py-4">
                          {v.resultado === "aprovado" ? (
                            v.status_entrega === "entregue" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                <CheckCheck className="w-3 h-3" /> Entregue
                              </span>
                            ) : (
                              <button
                                onClick={() => marcarEntregue(v.id)}
                                disabled={entregandoId === v.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-60"
                              >
                                <Truck className="w-3 h-3" /> {entregandoId === v.id ? "..." : "Marcar entregue"}
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4"><span className="text-sm text-[#717182]">{v.criado_em ? new Date(v.criado_em).toLocaleString("pt-BR") : "—"}</span></td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "residuos" && (
        <>
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
        <h3 className="text-lg font-semibold text-[#424242] mb-6">Fluxo da Logística Reversa</h3>
        <div className="flex items-center justify-between">
          {[
            { icon: Factory,   label: "Produção",        sub: "Geração de resíduos",   count: residuos.filter(r=>r.status==="producao").length },
            { icon: Package,   label: "Separação",       sub: "Classificação por tipo", count: residuos.filter(r=>r.status==="separacao").length },
            { icon: Warehouse, label: "Armazenamento",   sub: "Estoque temporário",     count: residuos.filter(r=>r.status==="armazenamento").length },
            { icon: Recycle,   label: "Reaproveitamento",sub: "ou Descarte",            count: reaproveitados },
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
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Impacto Financeiro</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : residuos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-[#717182]">
                    Nenhum resíduo registrado ainda. Use a página “Registro de Resíduos” para começar.
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
                        <p className="text-sm font-semibold text-[#424242]">{r.material_name || "—"}</p>
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
                      <span className="text-sm text-[#424242] capitalize">{r.setor_origem || "—"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(r.status)}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-[#424242]">
                        {DESTINO_LABEL[r.destino] || r.destino || "—"}
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
                      {r.destino === "descarte" && Number(r.prejuizo_descarte) > 0 ? (
                        <span className="text-sm font-medium text-red-600">
                          − R$ {Number(r.prejuizo_descarte).toFixed(2)}
                        </span>
                      ) : Number(r.valor_economizado) !== 0 ? (
                        <span className="text-sm font-medium text-green-600">
                          + R$ {Number(r.valor_economizado).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-[#717182]">
                        {r.criado_em ? new Date(r.criado_em).toLocaleDateString("pt-BR") : "—"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
