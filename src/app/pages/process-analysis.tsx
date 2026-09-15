import { useEffect, useState } from "react";
import {
  TrendingDown, ShieldCheck, PiggyBank, AlertOctagon, Target, Brain, ScanLine,
} from "lucide-react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { StatCard } from "../components/stat-card";
import api from "../lib/api";

interface ProcessoStats {
  valor_total_em_risco: number;
  prejuizo_real: number;
  economia_gerada: number;
  custo_reaproveitamento: number;
  perda_simulada_sem_processo: number;
  taxa_desperdicio_real: number;
  taxa_economia_gerada: number;
  taxa_prejuizo_evitado: number;
  taxa_perda_simulada_sem_processo: number;
  precisao_sistema: {
    taxa_aprovacao_expedicao: number;
    total_validacoes: number;
    confianca_media_ia_referencia: number;
  };
  projecao: {
    historico_mensal: { mes: string; economia: number; prejuizo: number }[];
    proximos_meses: { mes_relativo: number; economia_projetada: number; prejuizo_projetado: number }[];
  };
}

function addMonths(yyyyMm: string, n: number) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, (m - 1) + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const fmtR$ = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ProcessAnalysis() {
  const [stats, setStats] = useState<ProcessoStats | null>(null);

  useEffect(() => {
    api.get<ProcessoStats>("/api/analise/processo")
      .then((r) => setStats(r.data))
      .catch(() => {/* silently keep null */});
  }, []);

  const comparativo = stats ? [
    { label: "Com o processo", valor: stats.prejuizo_real, projetado: false },
    { label: "Sem o processo (simulado)", valor: stats.perda_simulada_sem_processo, projetado: true },
  ] : [];

  const historico = stats?.projecao.historico_mensal ?? [];
  const ultimoMes = historico.length ? historico[historico.length - 1].mes : null;
  const projecaoChart = [
    ...historico.map((m) => ({ mes: m.mes, economia: m.economia, prejuizo: m.prejuizo, projetado: false })),
    ...(stats?.projecao.proximos_meses ?? []).map((p) => ({
      mes: ultimoMes ? addMonths(ultimoMes, p.mes_relativo) : `M+${p.mes_relativo}`,
      economia: p.economia_projetada,
      prejuizo: p.prejuizo_projetado,
      projetado: true,
    })),
  ];

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-[#424242] mb-2">Análise do Processo</h1>
        <p className="text-sm lg:text-base text-[#717182]">
          Taxas de desperdício, economia e simulações — o cadastro de materiais agora fica em Cadastros
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
        <StatCard
          title="Taxa de Desperdício Real"
          value={`${stats?.taxa_desperdicio_real ?? 0}%`}
          icon={TrendingDown}
          trend="Do valor total em risco, o que virou perda"
          trendUp={false}
          iconColor="bg-red-100 text-red-700"
        />
        <StatCard
          title="Taxa de Economia Gerada"
          value={`${stats?.taxa_economia_gerada ?? 0}%`}
          icon={PiggyBank}
          trend="Do valor total em risco, o que foi recuperado"
          trendUp={true}
          iconColor="bg-green-100 text-green-700"
        />
        <StatCard
          title="Taxa de Prejuízo Evitado"
          value={`${stats?.taxa_prejuizo_evitado ?? 0}%`}
          icon={ShieldCheck}
          trend="De tudo que poderia ter sido perdido"
          trendUp={true}
          iconColor="bg-[#66BB6A]/10 text-[#66BB6A]"
        />
        <StatCard
          title="Desperdício Simulado sem o Processo"
          value={`${stats?.taxa_perda_simulada_sem_processo ?? 0}%`}
          icon={AlertOctagon}
          trend="Cenário contrafactual: sem reaproveitamento"
          trendUp={false}
          iconColor="bg-orange-100 text-orange-700"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 mb-6 lg:mb-8">
        <StatCard title="Valor Total em Risco" value={fmtR$(stats?.valor_total_em_risco ?? 0)} icon={Target} trend="Peso × valor de mercado de tudo registrado" trendUp={true} />
        <StatCard title="Prejuízo Real Acumulado" value={fmtR$(stats?.prejuizo_real ?? 0)} icon={TrendingDown} trend="Perdas efetivas com descarte" trendUp={false} iconColor="bg-red-100 text-red-700" />
        <StatCard title="Economia Gerada Acumulada" value={fmtR$(stats?.economia_gerada ?? 0)} icon={PiggyBank} trend="Economia líquida do reaproveitamento" trendUp={true} iconColor="bg-green-100 text-green-700" />
      </div>

      {/* Comparativo com/sem processo */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-6 lg:mb-8">
        <h3 className="text-lg font-semibold text-[#424242] mb-1">Com o Processo vs. Simulado sem o Processo</h3>
        <p className="text-xs text-[#717182] mb-6">Se todo material hoje reaproveitado/reciclado/vendido tivesse sido descartado</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={comparativo}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" stroke="#717182" tick={{ fontSize: 12 }} />
            <YAxis stroke="#717182" tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmtR$(v)} />
            <Bar dataKey="valor" radius={[8, 8, 0, 0]} name="Prejuízo (R$)">
              {comparativo.map((d, i) => (
                <Cell key={i} fill={d.projetado ? "#EF9A9A" : "#D32F2F"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Precisão do sistema */}
      <div className="mb-6 lg:mb-8">
        <div className="flex items-center gap-2 mb-4">
          <ScanLine className="w-6 h-6 text-[#2E7D32]" />
          <h2 className="text-xl font-bold text-[#424242]">Precisão do Sistema</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          <StatCard
            title="Aprovação na Expedição"
            value={`${stats?.precisao_sistema.taxa_aprovacao_expedicao ?? 0}%`}
            icon={ScanLine}
            trend={`${stats?.precisao_sistema.total_validacoes ?? 0} validações no total`}
            trendUp={true}
          />
          <StatCard
            title="Confiança Média da IA de Referência"
            value={`${stats?.precisao_sistema.confianca_media_ia_referencia ?? 0}%`}
            icon={Brain}
            trend="Leitura não-vinculante da validação de expedição"
            trendUp={true}
            iconColor="bg-purple-100 text-purple-700"
          />
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-center">
            <p className="text-xs text-amber-800 leading-relaxed">
              A confiança da IA é só uma referência da validação de expedição —
              não é usada para classificar material no registro de resíduos,
              que é feito manualmente pela equipe.
            </p>
          </div>
        </div>
      </div>

      {/* Projeção */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-[#424242] mb-1">Histórico e Projeção (economia vs. prejuízo)</h3>
        <p className="text-xs text-[#717182] mb-6">
          Últimos {historico.length} meses registrados + estimativa simples para os próximos 3 meses (barras mais claras) — não é um modelo estatístico, é uma média móvel.
        </p>
        {projecaoChart.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-[#717182] text-sm">Sem dados suficientes ainda.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={projecaoChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" stroke="#717182" tick={{ fontSize: 11 }} />
              <YAxis stroke="#717182" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtR$(v)} />
              <Legend />
              <Bar dataKey="economia" name="Economia (R$)" radius={[6, 6, 0, 0]}>
                {projecaoChart.map((d, i) => <Cell key={i} fill="#2E7D32" fillOpacity={d.projetado ? 0.4 : 1} />)}
              </Bar>
              <Bar dataKey="prejuizo" name="Prejuízo (R$)" radius={[6, 6, 0, 0]}>
                {projecaoChart.map((d, i) => <Cell key={i} fill="#D32F2F" fillOpacity={d.projetado ? 0.4 : 1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
