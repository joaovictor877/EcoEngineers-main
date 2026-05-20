import { useState } from "react";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

// Mock data
const initialMaterials = [
  {
    id: 1,
    name: "Aço Carbono",
    category: "Metais Ferrosos",
    type: "Sucata",
    dateAdded: "2026-01-15",
  },
  {
    id: 2,
    name: "Alumínio 6061",
    category: "Metais Não Ferrosos",
    type: "Aparas",
    dateAdded: "2026-01-20",
  },
  {
    id: 3,
    name: "Cobre Eletrolítico",
    category: "Metais Não Ferrosos",
    type: "Retalhos",
    dateAdded: "2026-02-05",
  },
  {
    id: 4,
    name: "Ferro Fundido",
    category: "Metais Ferrosos",
    type: "Sucata",
    dateAdded: "2026-02-12",
  },
  {
    id: 5,
    name: "Inox 304",
    category: "Metais Especiais",
    type: "Aparas",
    dateAdded: "2026-02-28",
  },
];

export function MaterialManagement() {
  const [materials, setMaterials] = useState(initialMaterials);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const filteredMaterials = materials.filter(
    (material) =>
      material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      material.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = (id: number) => {
    setMaterials(materials.filter((m) => m.id !== id));
    toast.success("Material removido com sucesso!");
  };

  const handleEdit = (id: number) => {
    toast.info("Funcionalidade de edição em desenvolvimento");
  };

  const handleAdd = () => {
    setShowAddModal(true);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#424242] mb-2">
          Gestão de Materiais
        </h1>
        <p className="text-[#717182]">
          Cadastro e gerenciamento de materiais recicláveis
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-6">
        <div className="flex flex-col md:flex-row gap-4 justify-between">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#717182]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar materiais..."
              className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
            />
          </div>

          {/* Add Button */}
          <button
            onClick={handleAdd}
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
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  ID
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  Nome do Material
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  Categoria
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  Tipo
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  Data de Cadastro
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-[#424242]">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMaterials.map((material) => (
                <tr
                  key={material.id}
                  className="hover:bg-[#F5F5F5]/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-[#424242]">
                      {String(material.id).padStart(3, "0")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-[#424242]">
                      {material.name}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#424242]">
                      {material.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#2E7D32]/10 text-[#2E7D32]">
                      {material.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-[#424242]">
                      {new Date(material.dateAdded).toLocaleDateString("pt-BR")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(material.id)}
                        className="p-2 hover:bg-[#F5F5F5] rounded-lg transition-colors group"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4 text-[#717182] group-hover:text-[#2E7D32]" />
                      </button>
                      <button
                        onClick={() => handleDelete(material.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors group"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4 text-[#717182] group-hover:text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredMaterials.length === 0 && (
            <div className="text-center py-12">
              <p className="text-[#717182]">
                Nenhum material encontrado.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-sm text-[#717182] mb-1">Total de Materiais</h3>
          <p className="text-2xl font-bold text-[#424242]">{materials.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-sm text-[#717182] mb-1">Categorias</h3>
          <p className="text-2xl font-bold text-[#424242]">
            {new Set(materials.map((m) => m.category)).size}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-sm text-[#717182] mb-1">Tipos</h3>
          <p className="text-2xl font-bold text-[#424242]">
            {new Set(materials.map((m) => m.type)).size}
          </p>
        </div>
      </div>
    </div>
  );
}
