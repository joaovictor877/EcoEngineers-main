import { useState } from "react";
import { FileDown, Filter } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Mock data
const monthlyData = [
  { mes: "Set", gerado: 1200, reaproveitado: 950, descartado: 250 },
  { mes: "Out", gerado: 1450, reaproveitado: 1150, descartado: 300 },
  { mes: "Nov", gerado: 1100, reaproveitado: 880, descartado: 220 },
  { mes: "Dez", gerado: 1600, reaproveitado: 1280, descartado: 320 },
  { mes: "Jan", gerado: 1350, reaproveitado: 1080, descartado: 270 },
  { mes: "Fev", gerado: 1280, reaproveitado: 1050, descartado: 230 },
  { mes: "Mar", gerado: 1520, reaproveitado: 1220, descartado: 300 },
];

const departmentData = [
  { setor: "Produção", total: 3450 },
  { setor: "Montagem", total: 2780 },
  { setor: "Estamparia", total: 2190 },
  { setor: "Pintura", total: 1840 },
  { setor: "Usinagem", total: 2540 },
];

export function Reports() {
  const [filters, setFilters] = useState({
    startDate: "2025-09-01",
    endDate: "2026-03-15",
    materialType: "",
    department: "",
  });

  const handleExportPDF = () => {
    toast.success("Relatório exportado em PDF!");
  };

  const handleExportExcel = () => {
    toast.success("Relatório exportado em Excel!");
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#424242] mb-2">Relatórios</h1>
        <p className="text-[#717182]">
          Análise de dados e exportação de relatórios
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Filter className="w-5 h-5 text-[#2E7D32]" />
          <h3 className="text-lg font-semibold text-[#424242]">Filtros</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Start Date */}
          <div>
            <label className="block text-sm text-[#424242] mb-2">
              Data Inicial
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) =>
                setFilters({ ...filters, startDate: e.target.value })
              }
              className="w-full px-4 py-2 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm text-[#424242] mb-2">
              Data Final
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) =>
                setFilters({ ...filters, endDate: e.target.value })
              }
              className="w-full px-4 py-2 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
            />
          </div>

          {/* Material Type */}
          <div>
            <label className="block text-sm text-[#424242] mb-2">
              Tipo de Material
            </label>
            <select
              value={filters.materialType}
              onChange={(e) =>
                setFilters({ ...filters, materialType: e.target.value })
              }
              className="w-full px-4 py-2 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
            >
              <option value="">Todos os materiais</option>
              <option value="aco">Aço</option>
              <option value="aluminio">Alumínio</option>
              <option value="cobre">Cobre</option>
              <option value="ferro">Ferro</option>
              <option value="inox">Inox</option>
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="block text-sm text-[#424242] mb-2">Setor</label>
            <select
              value={filters.department}
              onChange={(e) =>
                setFilters({ ...filters, department: e.target.value })
              }
              className="w-full px-4 py-2 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
            >
              <option value="">Todos os setores</option>
              <option value="producao">Produção</option>
              <option value="montagem">Montagem</option>
              <option value="estamparia">Estamparia</option>
              <option value="pintura">Pintura</option>
              <option value="usinagem">Usinagem</option>
            </select>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleExportPDF}
            className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-6 py-2 rounded-lg transition-colors font-medium flex items-center gap-2"
          >
            <FileDown className="w-5 h-5" />
            Exportar PDF
          </button>
          <button
            onClick={handleExportExcel}
            className="bg-[#66BB6A] hover:bg-[#4CAF50] text-white px-6 py-2 rounded-lg transition-colors font-medium flex items-center gap-2"
          >
            <FileDown className="w-5 h-5" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-sm text-[#717182] mb-1">Total Gerado</h3>
          <p className="text-2xl font-bold text-[#424242]">9.300 kg</p>
          <p className="text-xs text-[#66BB6A] mt-1">↑ 8% vs período anterior</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-sm text-[#717182] mb-1">Reaproveitado</h3>
          <p className="text-2xl font-bold text-[#424242]">7.610 kg</p>
          <p className="text-xs text-[#66BB6A] mt-1">
            ↑ 12% vs período anterior
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-sm text-[#717182] mb-1">Descartado</h3>
          <p className="text-2xl font-bold text-[#424242]">1.690 kg</p>
          <p className="text-xs text-red-500 mt-1">↑ 3% vs período anterior</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-sm text-[#717182] mb-1">Taxa de Reaproveitamento</h3>
          <p className="text-2xl font-bold text-[#424242]">81.8%</p>
          <p className="text-xs text-[#66BB6A] mt-1">↑ 4% vs período anterior</p>
        </div>
      </div>

      {/* Charts */}
      <div className="space-y-6">
        {/* Line Chart */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242] mb-6">
            Evolução Mensal de Resíduos
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" stroke="#717182" />
              <YAxis stroke="#717182" />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="gerado"
                stroke="#424242"
                strokeWidth={2}
                name="Gerado (kg)"
              />
              <Line
                type="monotone"
                dataKey="reaproveitado"
                stroke="#2E7D32"
                strokeWidth={2}
                name="Reaproveitado (kg)"
              />
              <Line
                type="monotone"
                dataKey="descartado"
                stroke="#d4183d"
                strokeWidth={2}
                name="Descartado (kg)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242] mb-6">
            Resíduos por Setor (Período Selecionado)
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={departmentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="setor" stroke="#717182" />
              <YAxis stroke="#717182" />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="total"
                fill="#2E7D32"
                name="Total (kg)"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
