import { useState, useEffect, useMemo } from "react";
import { FileDown, Filter, TrendingUp, TrendingDown, Package, Recycle, RefreshCw, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import api from "../lib/api";

interface Waste {
  id: number;
  material_id: number;
  material_name: string;
  quantity: number;
  location: string;
  recovered: number;
  value: number;
  created_at: string;
}

interface DashboardStats {
  total_kg: number;
  reused_kg: number;
  by_material: { name: string; total: number }[];
}

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const COLORS = ["#2E7D32", "#66BB6A", "#F9A825", "#0288D1", "#7B1FA2", "#D32F2F", "#00796B", "#E64A19"];

export function Reports() {
  const [wastes, setWastes] = useState<Waste[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    materialName: "",
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [wastesRes, statsRes] = await Promise.all([
        api.get<Waste[]>("/api/wastes"),
        api.get<DashboardStats>("/api/dashboard/stats"),
      ]);
      setWastes(wastesRes.data);
      setStats(statsRes.data);
    } catch {
      toast.error("Falha ao carregar relatórios");
    } finally {
      setLoading(false);
    }
  }

  /* ── filtered wastes ── */
  const filtered = useMemo(() => {
    const start = filters.startDate ? new Date(filters.startDate + "T00:00:00") : null;
    const end   = filters.endDate   ? new Date(filters.endDate   + "T23:59:59") : null;
    return wastes.filter((w) => {
      const d = new Date(w.created_at);
      if (start && d < start) return false;
      if (end   && d > end)   return false;
      if (filters.materialName && w.material_name !== filters.materialName) return false;
      return true;
    });
  }, [wastes, filters]);

  /* ── KPIs ── */
  const totalKg    = filtered.reduce((s, w) => s + Number(w.quantity || 0), 0);
  const reusedKg   = stats ? Number(stats.reused_kg || 0) : 0;
  const discarded  = Math.max(0, totalKg - reusedKg);
  const reusedRate = totalKg > 0 ? ((reusedKg / totalKg) * 100).toFixed(1) : "0.0";

  /* ── monthly chart ── */
  const monthlyData = useMemo(() => {
    const map: Record<string, { mes: string; gerado: number }> = {};
    filtered.forEach((w) => {
      const d = new Date(w.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MONTHS_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
      if (!map[key]) map[key] = { mes: label, gerado: 0 };
      map[key].gerado += Number(w.quantity || 0);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [filtered]);

  /* ── by material ── */
  const byMaterial = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((w) => {
      const name = w.material_name || "Desconhecido";
      map[name] = (map[name] || 0) + Number(w.quantity || 0);
    });
    return Object.entries(map)
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  /* ── material names for filter ── */
  const materialNames = useMemo(
    () => Array.from(new Set(wastes.map((w) => w.material_name).filter(Boolean))).sort(),
    [wastes]
  );

  /* ── CSV export (via backend — richer data from registros_residuos) ── */
  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.startDate)    params.set('startDate', filters.startDate);
      if (filters.endDate)      params.set('endDate',   filters.endDate);
      if (filters.materialName) params.set('material',  filters.materialName);
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`/api/reports/export/csv?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecoengineers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Arquivo CSV exportado com sucesso!');
    } catch (err: any) {
      toast.error('Falha ao exportar CSV: ' + (err?.message || err));
    }
  };

  /* ── Excel export (via backend) ── */
  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.startDate)    params.set('startDate', filters.startDate);
      if (filters.endDate)      params.set('endDate',   filters.endDate);
      if (filters.materialName) params.set('material',  filters.materialName);
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`/api/reports/export/excel?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecoengineers-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Planilha Excel exportada com sucesso!');
    } catch (err: any) {
      toast.error('Falha ao exportar Excel: ' + (err?.message || err));
    }
  };

  /* ── PDF print ── */
  const handlePrint = () => {
    if (filtered.length === 0) { toast.error("Nenhum dado para imprimir"); return; }
    const now = new Date().toLocaleDateString("pt-BR", { dateStyle: "long" });
    const rows = filtered.slice(0, 50).map((w) => `
      <tr>
        <td>${w.id}</td>
        <td>${w.material_name || "—"}</td>
        <td style="text-align:right">${Number(w.quantity || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} kg</td>
        <td>${w.location || "—"}</td>
        <td style="color:${w.recovered ? "#2E7D32" : "#D32F2F"}">${w.recovered ? "Sim" : "Não"}</td>
        <td style="text-align:right">R$ ${Number(w.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
        <td>${new Date(w.created_at).toLocaleDateString("pt-BR")}</td>
      </tr>`).join("");
    const matRows = byMaterial.map((m) =>
      `<tr><td>${m.name}</td><td style="text-align:right">${m.total.toLocaleString("pt-BR")} kg</td></tr>`).join("");
    const win = window.open("", "_blank");
    if (!win) { toast.error("Popup bloqueado. Permita popups e tente novamente."); return; }
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório EcoEngineers</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #333; margin: 20px; }
  h1 { color: #2E7D32; font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #717182; font-size: 13px; margin-bottom: 24px; }
  .kpi-row { display: flex; gap: 16px; margin-bottom: 24px; }
  .kpi { border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 20px; flex: 1; }
  .kpi-label { font-size: 11px; color: #717182; }
  .kpi-value { font-size: 20px; font-weight: bold; color: #424242; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #f5f5f5; padding: 8px; text-align: left; font-size: 11px; }
  td { padding: 7px 8px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
  .section-title { font-size: 14px; font-weight: bold; color: #424242; margin: 16px 0 8px; }
  .footer { margin-top: 32px; font-size: 10px; color: #999; text-align: center; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>Relatório de Resíduos — EcoEngineers</h1>
<div class="subtitle">Gerado em ${now} &nbsp;|&nbsp; Período: ${filters.startDate} a ${filters.endDate}</div>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-label">Total Gerado</div><div class="kpi-value">${totalKg.toLocaleString("pt-BR")} kg</div></div>
  <div class="kpi"><div class="kpi-label">Reaproveitado</div><div class="kpi-value" style="color:#2E7D32">${reusedKg.toLocaleString("pt-BR")} kg</div></div>
  <div class="kpi"><div class="kpi-label">Descartado</div><div class="kpi-value" style="color:#D32F2F">${discarded.toLocaleString("pt-BR")} kg</div></div>
  <div class="kpi"><div class="kpi-label">Taxa de Reaproveitamento</div><div class="kpi-value" style="color:#2E7D32">${reusedRate}%</div></div>
</div>
<div class="section-title">Resumo por Material</div>
<table><thead><tr><th>Material</th><th>Total (kg)</th></tr></thead><tbody>${matRows}</tbody></table>
<div class="section-title">Registros de Resíduos (últimos ${Math.min(filtered.length, 50)})</div>
<table><thead><tr><th>ID</th><th>Material</th><th>Qtd (kg)</th><th>Local</th><th>Reaprov.</th><th>Valor</th><th>Data</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer">EcoEngineers &copy; ${new Date().getFullYear()} — Relatório gerado automaticamente</div>
<script>window.onload=()=>{ window.print(); window.close(); }</script>
</body></html>`);
    win.document.close();
    toast.success("Relatório enviado para impressão!");
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#424242] mb-1">Relatórios</h1>
          <p className="text-[#717182]">Análise de dados e exportação de relatórios</p>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-[#717182]"
          title="Atualizar dados"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Filter className="w-5 h-5 text-[#2E7D32]" />
          <h3 className="text-lg font-semibold text-[#424242]">Filtros</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-[#424242] mb-1.5">Data Inicial</label>
            <input type="date" value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#424242] mb-1.5">Data Final</label>
            <input type="date" value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#424242] mb-1.5">Material</label>
            <select value={filters.materialName}
              onChange={(e) => setFilters((f) => ({ ...f, materialName: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all text-sm bg-white">
              <option value="">Todos os materiais</option>
              {materialNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-2">
          <button onClick={handlePrint}
            className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-5 py-2.5 rounded-lg transition-colors font-medium flex items-center gap-2 text-sm">
            <Printer className="w-4 h-4" /> Exportar PDF
          </button>
          <button onClick={handleExportCSV}
            className="bg-[#66BB6A] hover:bg-[#4CAF50] text-white px-5 py-2.5 rounded-lg transition-colors font-medium flex items-center gap-2 text-sm">
            <FileDown className="w-4 h-4" /> Exportar CSV
          </button>
          <button onClick={handleExportExcel}
            className="bg-[#0288D1] hover:bg-[#0277BD] text-white px-5 py-2.5 rounded-lg transition-colors font-medium flex items-center gap-2 text-sm">
            <FileDown className="w-4 h-4" /> Exportar Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 border border-gray-100 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/2 mb-3" />
              <div className="h-8 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-[#2E7D32]/10 p-2 rounded-lg"><Package className="w-5 h-5 text-[#2E7D32]" /></div>
            </div>
            <p className="text-sm text-[#717182]">Total Gerado</p>
            <p className="text-2xl font-bold text-[#424242] mt-0.5">{fmt(totalKg)} <span className="text-base font-normal text-[#717182]">kg</span></p>
            <p className="text-xs text-[#717182] mt-1">{filtered.length} registros no período</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-green-100 p-2 rounded-lg"><Recycle className="w-5 h-5 text-green-600" /></div>
            </div>
            <p className="text-sm text-[#717182]">Reaproveitado</p>
            <p className="text-2xl font-bold text-green-600 mt-0.5">{fmt(reusedKg)} <span className="text-base font-normal text-[#717182]">kg</span></p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-green-500" />
              <p className="text-xs text-green-600">Meta ambiental alcançada</p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-red-100 p-2 rounded-lg"><TrendingDown className="w-5 h-5 text-red-500" /></div>
            </div>
            <p className="text-sm text-[#717182]">Descartado</p>
            <p className="text-2xl font-bold text-red-500 mt-0.5">{fmt(discarded)} <span className="text-base font-normal text-[#717182]">kg</span></p>
            <p className="text-xs text-[#717182] mt-1">Resíduos não reaproveitados</p>
          </div>
          <div className="bg-gradient-to-br from-[#2E7D32] to-[#66BB6A] rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-white/20 p-2 rounded-lg"><TrendingUp className="w-5 h-5 text-white" /></div>
            </div>
            <p className="text-sm text-white/80">Taxa de Reaproveitamento</p>
            <p className="text-2xl font-bold text-white mt-0.5">{reusedRate}<span className="text-base font-normal text-white/80">%</span></p>
            <p className="text-xs text-white/70 mt-1">Eficiência do período</p>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Monthly line chart */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242] mb-6">Evolução Mensal de Resíduos</h3>
          {monthlyData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-[#717182] text-sm">
              {loading ? "Carregando..." : "Sem dados para o período selecionado."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" stroke="#717182" tick={{ fontSize: 12 }} />
                <YAxis stroke="#717182" tick={{ fontSize: 12 }} unit=" kg" width={65} />
                <Tooltip formatter={(v: number) => [`${fmt(v)} kg`, "Gerado"]} />
                <Line type="monotone" dataKey="gerado" stroke="#2E7D32" strokeWidth={3}
                  dot={{ fill: "#2E7D32", r: 5 }} activeDot={{ r: 8 }} name="Gerado (kg)" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie chart */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242] mb-6">Distribuição por Material</h3>
          {byMaterial.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-[#717182] text-sm">
              {loading ? "Carregando..." : "Sem dados para o período selecionado."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={byMaterial.slice(0, 8)} dataKey="total" nameKey="name"
                  cx="50%" cy="50%" outerRadius={100}
                  label={({ name, percent }) => percent > 0.05 ? `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%` : ""}>
                  {byMaterial.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `${fmt(v)} kg`} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bar chart by material */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-6">
        <h3 className="text-lg font-semibold text-[#424242] mb-6">Total por Material (kg)</h3>
        {byMaterial.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-[#717182] text-sm">
            {loading ? "Carregando..." : "Sem dados para o período selecionado."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byMaterial.slice(0, 10)} layout="vertical" margin={{ left: 16, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" stroke="#717182" tick={{ fontSize: 11 }} unit=" kg" />
              <YAxis type="category" dataKey="name" stroke="#717182" tick={{ fontSize: 11 }} width={130} />
              <Tooltip formatter={(v: number) => [`${fmt(v)} kg`, "Total"]} />
              <Bar dataKey="total" fill="#2E7D32" radius={[0, 8, 8, 0]} name="Total (kg)" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent records table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242]">
            Registros Recentes
            <span className="ml-2 text-sm font-normal text-[#717182]">({filtered.length} no período)</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F5F5F5]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#424242] uppercase tracking-wide">ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#424242] uppercase tracking-wide">Material</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-[#424242] uppercase tracking-wide">Quantidade</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#424242] uppercase tracking-wide">Local</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#424242] uppercase tracking-wide">Reaprov.</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-[#424242] uppercase tracking-wide">Valor</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#424242] uppercase tracking-wide">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-6 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#717182]">
                    Nenhum registro encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filtered.slice(0, 30).map((w) => (
                  <tr key={w.id} className="hover:bg-[#F5F5F5]/50 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-[#717182]">#{w.id}</td>
                    <td className="px-6 py-3 text-sm font-medium text-[#424242]">{w.material_name || "—"}</td>
                    <td className="px-6 py-3 text-sm text-right text-[#424242]">
                      {Number(w.quantity || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} kg
                    </td>
                    <td className="px-6 py-3 text-sm text-[#717182]">{w.location || "—"}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${w.recovered ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {w.recovered ? "Sim" : "Não"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-[#424242]">
                      R$ {Number(w.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-3 text-sm text-[#717182]">
                      {new Date(w.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 30 && (
          <div className="px-6 py-3 bg-[#F5F5F5] text-xs text-[#717182] text-center border-t border-gray-100">
            Exibindo os 30 mais recentes de {filtered.length} registros. Use os filtros para refinar ou exporte para ver todos.
          </div>
        )}
      </div>
    </div>
  );
}
