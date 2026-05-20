import { Outlet, NavLink } from "react-router-dom";
import { 
  LayoutDashboard, 
  FileInput, 
  Route, 
  Package, 
  FileText, 
  Settings,
  Recycle,
  Menu,
  X
} from "lucide-react";
import { PageHeader } from "./page-header";
import { useState } from "react";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/register-waste", label: "Registrar Resíduo", icon: FileInput },
    { path: "/tracking", label: "Rastreamento de Material", icon: Route },
    { path: "/materials", label: "Gestão de Materiais", icon: Package },
    { path: "/reports", label: "Relatórios", icon: FileText },
    { path: "/settings", label: "Configurações", icon: Settings },
  ];

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
      <aside className={`w-64 bg-[#2E7D32] text-white flex flex-col fixed lg:static inset-y-0 left-0 z-40 transform transition-transform duration-300 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}>
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
        <nav className="flex-1 p-4">
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
                  <span className="text-sm">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[#1B5E20]">
          <div className="text-xs text-[#A5D6A7] text-center">
            © 2026 EcoEngineers
          </div>
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