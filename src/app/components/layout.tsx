import { Outlet, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FileInput,
  Route,
  FileText,
  Settings,
  Recycle,
  Menu,
  X,
  ScanLine,
  Tags,
  Camera,
  BarChart3,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCurrentUser, canAccess } from "../lib/useCurrentUser";
import { PageHeader } from "./page-header";
import api from "../lib/api";
import { socket } from "../lib/socket";
import { bipe, getAlertPrefs, notificarSistema } from "../lib/alerts";

interface ValidacaoEvento {
  id: number;
  resultado: "aprovado" | "reprovado";
  resolvido?: number | boolean;
  motivo_divergencia: string | null;
  produto_nome: string | null;
  qrcode_lido: string | null;
  posto_nome?: string | null;
}

const ALL_NAV = [
  { path: "/",                  label: "Dashboard",             icon: LayoutDashboard },
  { path: "/validation-station",label: "Posto de Validação",    icon: ScanLine        },
  { path: "/cameras",           label: "Câmeras",                icon: Camera          },
  { path: "/register-waste",    label: "Registrar Material",    icon: FileInput       },
  { path: "/tracking",          label: "Validação de Expedição",icon: Route           },
  { path: "/products",          label: "Cadastros",             icon: Tags            },
  { path: "/materials",         label: "Análise do Processo",   icon: BarChart3       },
  { path: "/reports",           label: "Relatórios",            icon: FileText        },
  { path: "/settings",          label: "Configurações",         icon: Settings        },
];

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const user = useCurrentUser();

  const navItems = ALL_NAV.filter((item) => canAccess(user?.role, item.path));

  // Alerta imediato de caixa reprovada em QUALQUER tela do sistema, e
  // contador de caixas retidas (reprovações ainda não resolvidas) no menu.
  const [retidas, setRetidas] = useState(0);
  useEffect(() => {
    const atualizarContador = () =>
      api.get<{ reprovadas_abertas: number }>("/api/validacoes/stats")
        .then((r) => setRetidas(Number(r.data.reprovadas_abertas || 0)))
        .catch(() => {});
    atualizarContador();

    const onValidacao = (v: ValidacaoEvento) => {
      if (v.resultado !== "reprovado") return;
      setRetidas((n) => n + 1);
      const prefs = getAlertPrefs();
      if (!prefs.reprovacoes) return;
      const caixa = v.qrcode_lido || `#${v.id}`;
      const titulo = `Caixa ${caixa} reprovada e retida`;
      const detalhe = `${v.produto_nome ? v.produto_nome + " — " : ""}${v.motivo_divergencia || "verifique a caixa"}`;
      toast.error(titulo, { description: detalhe, duration: 10000 });
      if (prefs.som) bipe();
      if (document.hidden) notificarSistema(titulo, detalhe);
    };

    socket.connect();
    socket.on("validacao_concluida", onValidacao);
    socket.on("validacao_resolvida", atualizarContador);
    return () => {
      socket.off("validacao_concluida", onValidacao);
      socket.off("validacao_resolvida", atualizarContador);
      socket.disconnect();
    };
  }, []);

  return (
    <div className="flex h-screen bg-[#F5F5F5]">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[#2E7D32] text-white rounded-lg shadow-lg"
      >
        {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`w-64 bg-[#2E7D32] text-white flex flex-col fixed lg:static inset-y-0 left-0 z-40 transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-[#1B5E20]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#66BB6A] rounded-lg flex items-center justify-center">
              <Recycle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">EcoEngineers</h1>
              <p className="text-xs text-[#A5D6A7]">Logística Reversa</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === "/"}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-[#66BB6A] text-white"
                        : "text-[#C8E6C9] hover:bg-[#1B5E20] hover:text-white"
                    }`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-sm flex-1">{item.label}</span>
                  {item.path === "/tracking" && retidas > 0 && (
                    <span
                      className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center"
                      title={`${retidas} caixa(s) retida(s)`}
                    >
                      {retidas}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[#1B5E20]">
          <p className="text-[10px] text-[#A5D6A7] text-center">© 2026 EcoEngineers</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col lg:ml-0">
        <PageHeader />
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}