import { useState } from "react";
import { User, Building, Bell, Shield, Database, Wifi } from "lucide-react";
import { toast } from "sonner";

export function Settings() {
  const [activeTab, setActiveTab] = useState("profile");

  const tabs = [
    { id: "profile", label: "Perfil", icon: User },
    { id: "company", label: "Empresa", icon: Building },
    { id: "notifications", label: "Notificações", icon: Bell },
    { id: "security", label: "Segurança", icon: Shield },
    { id: "hardware", label: "Hardware", icon: Wifi },
    { id: "data", label: "Dados", icon: Database },
  ];

  const handleSave = () => {
    toast.success("Configurações salvas com sucesso!");
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#424242] mb-2">
          Configurações
        </h1>
        <p className="text-[#717182]">
          Gerencie as configurações do sistema
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Tabs */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <nav className="flex flex-col">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-6 py-4 text-left transition-colors border-l-4 ${
                    activeTab === tab.id
                      ? "bg-[#F5F5F5] border-[#2E7D32] text-[#2E7D32]"
                      : "border-transparent text-[#717182] hover:bg-[#F5F5F5]"
                  }`}
                >
                  <tab.icon className="w-5 h-5" />
                  <span className="font-medium">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl shadow-sm p-8 border border-gray-100">
            {activeTab === "profile" && (
              <div>
                <h2 className="text-xl font-semibold text-[#424242] mb-6">
                  Configurações de Perfil
                </h2>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm text-[#424242] mb-2">
                      Nome Completo
                    </label>
                    <input
                      type="text"
                      defaultValue="João Silva"
                      className="w-full px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#424242] mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      defaultValue="joao.silva@ecoengineers.com"
                      className="w-full px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#424242] mb-2">
                      Cargo
                    </label>
                    <input
                      type="text"
                      defaultValue="Operador de Logística"
                      className="w-full px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
                    />
                  </div>
                  <button
                    onClick={handleSave}
                    className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-6 py-3 rounded-lg transition-colors font-medium"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </div>
            )}

            {activeTab === "company" && (
              <div>
                <h2 className="text-xl font-semibold text-[#424242] mb-6">
                  Informações da Empresa
                </h2>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm text-[#424242] mb-2">
                      Nome da Empresa
                    </label>
                    <input
                      type="text"
                      defaultValue="EcoEngineers Indústria"
                      className="w-full px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#424242] mb-2">
                      CNPJ
                    </label>
                    <input
                      type="text"
                      defaultValue="12.345.678/0001-90"
                      className="w-full px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#424242] mb-2">
                      Endereço
                    </label>
                    <input
                      type="text"
                      defaultValue="Av. Industrial, 1000 - São Paulo, SP"
                      className="w-full px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
                    />
                  </div>
                  <button
                    onClick={handleSave}
                    className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-6 py-3 rounded-lg transition-colors font-medium"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div>
                <h2 className="text-xl font-semibold text-[#424242] mb-6">
                  Preferências de Notificação
                </h2>
                <div className="space-y-4">
                  {[
                    {
                      label: "Notificações de novos registros",
                      description: "Receba alertas quando novos resíduos forem registrados",
                    },
                    {
                      label: "Alertas de metas de sustentabilidade",
                      description: "Notificações sobre o atingimento de metas ESG",
                    },
                    {
                      label: "Relatórios semanais",
                      description: "Receba um resumo semanal por email",
                    },
                    {
                      label: "Alertas de hardware",
                      description: "Notificações sobre status dos dispositivos conectados",
                    },
                  ].map((item, index) => (
                    <label
                      key={index}
                      className="flex items-start gap-3 p-4 rounded-lg hover:bg-[#F5F5F5] transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        defaultChecked
                        className="mt-1 w-5 h-5 rounded border-gray-300 text-[#2E7D32] focus:ring-[#2E7D32]"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-[#424242]">
                          {item.label}
                        </div>
                        <div className="text-xs text-[#717182] mt-1">
                          {item.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleSave}
                  className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-6 py-3 rounded-lg transition-colors font-medium mt-6"
                >
                  Salvar Preferências
                </button>
              </div>
            )}

            {activeTab === "security" && (
              <div>
                <h2 className="text-xl font-semibold text-[#424242] mb-6">
                  Segurança
                </h2>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm text-[#424242] mb-2">
                      Senha Atual
                    </label>
                    <input
                      type="password"
                      className="w-full px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#424242] mb-2">
                      Nova Senha
                    </label>
                    <input
                      type="password"
                      className="w-full px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#424242] mb-2">
                      Confirmar Nova Senha
                    </label>
                    <input
                      type="password"
                      className="w-full px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
                    />
                  </div>
                  <button
                    onClick={handleSave}
                    className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-6 py-3 rounded-lg transition-colors font-medium"
                  >
                    Alterar Senha
                  </button>
                </div>
              </div>
            )}

            {activeTab === "hardware" && (
              <div>
                <h2 className="text-xl font-semibold text-[#424242] mb-6">
                  Configurações de Hardware
                </h2>
                <div className="space-y-6">
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-semibold text-[#424242]">ESP32</h3>
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        Conectado
                      </span>
                    </div>
                    <div className="text-sm text-[#717182] space-y-1">
                      <div>IP: 192.168.1.100</div>
                      <div>Última atualização: 15/03/2026 14:32</div>
                    </div>
                  </div>

                  <div className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-semibold text-[#424242]">Arduino</h3>
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        Conectado
                      </span>
                    </div>
                    <div className="text-sm text-[#717182] space-y-1">
                      <div>Porta: COM3</div>
                      <div>Última atualização: 15/03/2026 14:30</div>
                    </div>
                  </div>

                  <div className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-semibold text-[#424242]">
                        Leitor de Código de Barras
                      </h3>
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        Pronto
                      </span>
                    </div>
                    <div className="text-sm text-[#717182] space-y-1">
                      <div>Modelo: Honeywell 1900</div>
                      <div>Última leitura: 15/03/2026 14:25</div>
                    </div>
                  </div>

                  <button
                    onClick={handleSave}
                    className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-6 py-3 rounded-lg transition-colors font-medium"
                  >
                    Testar Conexões
                  </button>
                </div>
              </div>
            )}

            {activeTab === "data" && (
              <div>
                <h2 className="text-xl font-semibold text-[#424242] mb-6">
                  Gerenciamento de Dados
                </h2>
                <div className="space-y-4">
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="font-semibold text-[#424242] mb-2">
                      Backup de Dados
                    </h3>
                    <p className="text-sm text-[#717182] mb-3">
                      Último backup: 14/03/2026 às 23:00
                    </p>
                    <button className="bg-[#66BB6A] hover:bg-[#4CAF50] text-white px-4 py-2 rounded-lg transition-colors text-sm">
                      Criar Backup Agora
                    </button>
                  </div>

                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="font-semibold text-[#424242] mb-2">
                      Exportar Todos os Dados
                    </h3>
                    <p className="text-sm text-[#717182] mb-3">
                      Exporte todos os dados do sistema em formato JSON
                    </p>
                    <button className="bg-[#F5F5F5] hover:bg-[#E0E0E0] text-[#424242] px-4 py-2 rounded-lg transition-colors text-sm">
                      Exportar JSON
                    </button>
                  </div>

                  <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
                    <h3 className="font-semibold text-red-700 mb-2">
                      Limpar Dados
                    </h3>
                    <p className="text-sm text-red-600 mb-3">
                      Atenção: Esta ação é irreversível
                    </p>
                    <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm">
                      Limpar Dados Antigos
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
