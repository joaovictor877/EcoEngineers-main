import { User, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  userName?: string;
  userRole?: string;
}

export function PageHeader({ userName = "João Silva", userRole = "Operador de Logística" }: PageHeaderProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate("/login");
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 lg:px-8 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 ml-12 lg:ml-0">
          <div className="text-xs lg:text-sm text-[#717182]">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            }).replace(/^\w/, (c) => c.toUpperCase())}
          </div>
        </div>

        <div className="flex items-center gap-2 lg:gap-4">
          <div className="hidden md:flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium text-[#424242]">
                {userName}
              </div>
              <div className="text-xs text-[#717182]">{userRole}</div>
            </div>
            <div className="w-10 h-10 bg-[#2E7D32] rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
          </div>

          <div className="md:hidden w-8 h-8 bg-[#2E7D32] rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>

          <button
            onClick={handleLogout}
            className="p-2 hover:bg-[#F5F5F5] rounded-lg transition-colors group"
            title="Sair"
          >
            <LogOut className="w-4 lg:w-5 h-4 lg:h-5 text-[#717182] group-hover:text-[#2E7D32]" />
          </button>
        </div>
      </div>
    </div>
  );
}