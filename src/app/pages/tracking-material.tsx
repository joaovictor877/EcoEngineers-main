import { Factory, Package, Warehouse, Recycle, Trash2, ArrowRight, Brain } from "lucide-react";

// Mock data
const materials = [
  {
    id: "MAT-001",
    type: "Cavaco de Aço",
    weight: 45.5,
    origin: "Produção",
    status: "Armazenamento",
    destination: "Reaproveitamento",
    iaDetectado: true,
    confiancaIA: 94.2,
  },
  {
    id: "MAT-002",
    type: "Alumínio",
    weight: 23.8,
    origin: "Montagem",
    status: "Reaproveitamento",
    destination: "Reaproveitamento",
    iaDetectado: true,
    confiancaIA: 87.6,
  },
  {
    id: "MAT-003",
    type: "Cobre",
    weight: 12.3,
    origin: "Estamparia",
    status: "Separação",
    destination: "Reciclagem",
    iaDetectado: false,
    confiancaIA: 0,
  },
  {
    id: "MAT-004",
    type: "Ferro",
    weight: 67.2,
    origin: "Usinagem",
    status: "Produção",
    destination: "Descarte",
    iaDetectado: true,
    confiancaIA: 79.1,
  },
  {
    id: "MAT-005",
    type: "Inox",
    weight: 34.9,
    origin: "Pintura",
    status: "Armazenamento",
    destination: "Reaproveitamento",
    iaDetectado: false,
    confiancaIA: 0,
  },
];

const getStatusColor = (status: string) => {
  switch (status) {
    case "Produção":
      return "bg-blue-100 text-blue-700";
    case "Separação":
      return "bg-yellow-100 text-yellow-700";
    case "Armazenamento":
      return "bg-purple-100 text-purple-700";
    case "Reaproveitamento":
      return "bg-green-100 text-green-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

export function TrackingMaterial() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#424242] mb-2">
          Rastreamento de Material
        </h1>
        <p className="text-[#717182]">
          Visualize o fluxo da logística reversa
        </p>
      </div>

      {/* Flow Diagram */}
      <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100 mb-8">
        <h3 className="text-lg font-semibold text-[#424242] mb-6">
          Fluxo da Logística Reversa
        </h3>
        <div className="flex items-center justify-between">
          {/* Step 1: Produção */}
          <div className="flex flex-col items-center text-center flex-1">
            <div className="w-16 h-16 bg-[#2E7D32]/10 rounded-full flex items-center justify-center mb-3">
              <Factory className="w-8 h-8 text-[#2E7D32]" />
            </div>
            <h4 className="font-semibold text-[#424242] mb-1">Produção</h4>
            <p className="text-xs text-[#717182]">
              Geração de resíduos
            </p>
          </div>

          <ArrowRight className="w-6 h-6 text-[#66BB6A] flex-shrink-0 mx-2" />

          {/* Step 2: Separação */}
          <div className="flex flex-col items-center text-center flex-1">
            <div className="w-16 h-16 bg-[#66BB6A]/10 rounded-full flex items-center justify-center mb-3">
              <Package className="w-8 h-8 text-[#66BB6A]" />
            </div>
            <h4 className="font-semibold text-[#424242] mb-1">Separação</h4>
            <p className="text-xs text-[#717182]">
              Classificação por tipo
            </p>
          </div>

          <ArrowRight className="w-6 h-6 text-[#66BB6A] flex-shrink-0 mx-2" />

          {/* Step 3: Armazenamento */}
          <div className="flex flex-col items-center text-center flex-1">
            <div className="w-16 h-16 bg-[#2E7D32]/10 rounded-full flex items-center justify-center mb-3">
              <Warehouse className="w-8 h-8 text-[#2E7D32]" />
            </div>
            <h4 className="font-semibold text-[#424242] mb-1">Armazenamento</h4>
            <p className="text-xs text-[#717182]">
              Estoque temporário
            </p>
          </div>

          <ArrowRight className="w-6 h-6 text-[#66BB6A] flex-shrink-0 mx-2" />

          {/* Step 4: Reaproveitamento ou Descarte */}
          <div className="flex flex-col items-center text-center flex-1">
            <div className="w-16 h-16 bg-[#66BB6A]/10 rounded-full flex items-center justify-center mb-3">
              <div className="relative">
                <Recycle className="w-8 h-8 text-[#66BB6A]" />
              </div>
            </div>
            <h4 className="font-semibold text-[#424242] mb-1">
              Reaproveitamento
            </h4>
            <p className="text-xs text-[#717182]">ou Descarte</p>
          </div>
        </div>
      </div>

      {/* Materials Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-[#424242]">
            Materiais em Rastreamento
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F5F5F5]">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  ID do Material
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  Tipo
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  Peso (kg)
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  Origem
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  Destino
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  IA
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {materials.map((material) => (
                <tr
                  key={material.id}
                  className="hover:bg-[#F5F5F5]/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-[#424242]">
                      {material.id}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#424242]">
                      {material.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#424242]">
                      {material.weight}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#424242]">
                      {material.origin}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        material.status
                      )}`}
                    >
                      {material.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#424242]">
                      {material.destination}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {material.iaDetectado ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                        <Brain className="w-3 h-3" /> IA {material.confiancaIA.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Manual</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
