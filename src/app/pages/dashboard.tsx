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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { StatCard } from "../components/stat-card";

// Mock data
const materialTypesData = [
  { name: "Aço", value: 450, color: "#2E7D32" },
  { name: "Alumínio", value: 230, color: "#66BB6A" },
  { name: "Cobre", value: 180, color: "#81C784" },
  { name: "Ferro", value: 320, color: "#A5D6A7" },
  { name: "Outros", value: 120, color: "#C8E6C9" },
];

const wasteByDepartmentData = [
  { setor: "Produção", residuos: 450 },
  { setor: "Montagem", residuos: 380 },
  { setor: "Estamparia", residuos: 290 },
  { setor: "Pintura", residuos: 210 },
  { setor: "Usinagem", residuos: 340 },
];

const iaDetectionData = [
  { material: "Cavaco Aço", deteccoes: 78 },
  { material: "Alumínio", deteccoes: 52 },
  { material: "Cobre", deteccoes: 34 },
  { material: "Ferro", deteccoes: 47 },
  { material: "Inox", deteccoes: 21 },
  { material: "Sucata", deteccoes: 15 },
];

const monthlyWasteData = [
  { mes: "Set", kg: 1200 },
  { mes: "Out", kg: 1450 },
  { mes: "Nov", kg: 1100 },
  { mes: "Dez", kg: 1600 },
  { mes: "Jan", kg: 1350 },
  { mes: "Fev", kg: 1280 },
  { mes: "Mar", kg: 1520 },
];

export function Dashboard() {
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
          value="8.420 kg"
          icon={TrendingUp}
          trend="+12%"
          trendUp={true}
        />
        <StatCard
          title="Material Reaproveitado"
          value="6.340 kg"
          icon={Recycle}
          trend="+18%"
          trendUp={true}
          iconColor="bg-[#66BB6A]/10 text-[#66BB6A]"
        />
        <StatCard
          title="Economia Gerada"
          value="R$ 47.800"
          icon={DollarSign}
          trend="+25%"
          trendUp={true}
        />
        <StatCard
          title="Redução de Impacto Ambiental"
          value="75%"
          icon={Leaf}
          trend="-15%"
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
                data={materialTypesData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {materialTypesData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart - Resíduos por Setor */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242] mb-6">
            Produção de Resíduos por Setor
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={wasteByDepartmentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="setor" stroke="#717182" />
              <YAxis stroke="#717182" />
              <Tooltip />
              <Bar dataKey="residuos" fill="#2E7D32" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Line Chart - Geração de Resíduos por Mês */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-[#424242] mb-6">
          Geração de Resíduos por Mês
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyWasteData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" stroke="#717182" />
            <YAxis stroke="#717182" />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="kg"
              stroke="#2E7D32"
              strokeWidth={3}
              dot={{ fill: "#2E7D32", r: 5 }}
              activeDot={{ r: 8 }}
            />
          </LineChart>
        </ResponsiveContainer>
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
            value="247"
            icon={Brain}
            trend="+32%"
            trendUp={true}
            iconColor="bg-purple-100 text-purple-700"
          />
          <StatCard
            title="Peso Automático Total"
            value="3.240 kg"
            icon={Activity}
            trend="+28%"
            trendUp={true}
            iconColor="bg-blue-100 text-blue-700"
          />
          <StatCard
            title="Confiança Média"
            value="88.4%"
            icon={CheckCircle}
            trend="+3.2%"
            trendUp={true}
            iconColor="bg-green-100 text-green-700"
          />
          <StatCard
            title="Último Detectado"
            value="Cavaco de Aço"
            icon={Cpu}
            trend="Hoje"
            trendUp={true}
            iconColor="bg-orange-100 text-orange-700"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242] mb-6">
            Detecções por Material (IA)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={iaDetectionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="material" stroke="#717182" />
              <YAxis stroke="#717182" />
              <Tooltip />
              <Bar dataKey="deteccoes" fill="#9C27B0" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}