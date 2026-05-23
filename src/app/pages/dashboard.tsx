import { useState, useEffect } from "react";
import { 
  TrendingUp, 
  Recycle, 
  DollarSign, 
  Leaf,
  Brain,
  Activity,
  CheckCircle,
  Cpu
} from "lucide-react";
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { StatCard } from "../components/stat-card";
import api from "../lib/api";

interface DashStats {
  total_kg: number;
  reused_kg: number;
  by_material: { name: string; total: number }[];
}

interface IaStats {
  total_deteccoes: number;
  confianca_media: number;
  ultimo_material: string;
  por_material: { material_detectado: string; quantidade: number }[];
}

const COLORS = ["#2E7D32", "#66BB6A", "#81C784", "#A5D6A7", "#C8E6C9", "#F9A825", "#0288D1", "#7B1FA2"];

function fmt(v: number | null | undefined) {
  if (!v) return "0";
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(".", ",")}t`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function Dashboard() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [iaStats, setIaStats] = useState<IaStats | null>(null);

  useEffect(() => {
    api.get<DashStats>("/api/dashboard/stats")
      .then((r) => setStats(r.data))
      .catch(() => {/* silently keep null */});
    api.get<IaStats>("/api/dashboard/stats/ia")
      .then((r) => setIaStats(r.data))
      .catch(() => {});
  }, []);

  const totalKg  = stats?.total_kg  ?? 0;
  const reusedKg = stats?.reused_kg ?? 0;
  const savingsR$ = (reusedKg * 2.5).toFixed(0); // R$2.50/kg estimate
  const reuseRate = totalKg > 0 ? ((reusedKg / totalKg) * 100).toFixed(0) : "0";

  const materialPieData = (stats?.by_material ?? []).slice(0, 6).map((m, i) => ({
    name: m.name, value: Math.round(Number(m.total)), color: COLORS[i % COLORS.length],
  }));

  const iaBarData = (iaStats?.por_material ?? []).map((m) => ({
    material: (m.material_detectado || "?").split(" ").slice(0, 2).join(" "),
    deteccoes: Number(m.quantidade),
  }));

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-[#424242] mb-2">
          Dashboard ESG
        </h1>
        <p className="text-sm lg:text-base text-[#717182]">
          Indicadores de sustentabilidade e gestão de resíduos
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
        <StatCard
          title="Total de Resíduos Gerados"
          value={`${fmt(totalKg)} kg`}
          icon={TrendingUp}
          trend={totalKg > 0 ? "Período atual" : "Aguardando dados"}
          trendUp={true}
        />
        <StatCard
          title="Material Reaproveitado"
          value={`${fmt(reusedKg)} kg`}
          icon={Recycle}
          trend={reusedKg > 0 ? "Confirmado" : "Aguardando dados"}
          trendUp={true}
          iconColor="bg-[#66BB6A]/10 text-[#66BB6A]"
        />
        <StatCard
          title="Economia Gerada"
          value={`R$ ${Number(savingsR$).toLocaleString("pt-BR")}`}
          icon={DollarSign}
          trend="Estimativa"
          trendUp={true}
        />
        <StatCard
          title="Redução de Impacto Ambiental"
          value={`${reuseRate}%`}
          icon={Leaf}
          trend="Taxa de reaproveitamento"
          trendUp={true}
          iconColor="bg-[#66BB6A]/10 text-[#66BB6A]"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Pie Chart - Tipos de Materiais */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242] mb-6">
            Tipos de Materiais
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={materialPieData.length ? materialPieData : [{ name: "Sem dados", value: 1, color: "#e0e0e0" }]}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""
                }
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {(materialPieData.length ? materialPieData : [{ color: "#e0e0e0" }]).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `${v.toLocaleString("pt-BR")} kg`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart - by material */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242] mb-6">
            Resíduos por Material (kg)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={materialPieData.length ? materialPieData.map(m => ({ setor: m.name, residuos: m.value })) : []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="setor" stroke="#717182" tick={{ fontSize: 11 }} />
              <YAxis stroke="#717182" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `${v.toLocaleString("pt-BR")} kg`} />
              <Bar dataKey="residuos" fill="#2E7D32" radius={[8, 8, 0, 0]} name="Total (kg)" />
            </BarChart>
          </ResponsiveContainer>
          {materialPieData.length === 0 && (
            <p className="text-center text-sm text-[#717182] mt-4">Nenhum resíduo registrado ainda.</p>
          )}
        </div>
      </div>

      {/* IA Section */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-6">
          <Brain className="w-6 h-6 text-[#2E7D32]" />
          <h2 className="text-xl font-bold text-[#424242]">Inteligência Artificial</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6">
          <StatCard
            title="Total Detectado por IA"
            value={String(iaStats?.total_deteccoes ?? 0)}
            icon={Brain}
            trend={iaStats ? "Detecções acumuladas" : "Aguardando dados"}
            trendUp={true}
            iconColor="bg-purple-100 text-purple-700"
          />
          <StatCard
            title="Peso Automático Total"
            value={`${fmt(totalKg)} kg`}
            icon={Activity}
            trend="Via câmera + ESP32"
            trendUp={true}
            iconColor="bg-blue-100 text-blue-700"
          />
          <StatCard
            title="Confiança Média"
            value={iaStats?.confianca_media ? `${Number(iaStats.confianca_media).toFixed(1)}%` : "—"}
            icon={CheckCircle}
            trend="Precisão do modelo"
            trendUp={true}
            iconColor="bg-green-100 text-green-700"
          />
          <StatCard
            title="Último Detectado"
            value={iaStats?.ultimo_material ?? "—"}
            icon={Cpu}
            trend="Última análise IA"
            trendUp={true}
            iconColor="bg-orange-100 text-orange-700"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242] mb-6">
            Detecções por Material (IA)
          </h3>
          {iaBarData.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-[#717182] text-sm">
              Nenhuma análise de IA registrada ainda.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={iaBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="material" stroke="#717182" tick={{ fontSize: 11 }} />
                <YAxis stroke="#717182" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="deteccoes" fill="#9C27B0" radius={[8, 8, 0, 0]} name="Detecções" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
