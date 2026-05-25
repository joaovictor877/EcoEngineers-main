import { useState } from "react";
import { User, LogOut, X, Mail, Briefcase, Building2, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCurrentUser, ROLE_LABEL, ROLE_BADGE } from "../lib/useCurrentUser";

export function PageHeader() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [profileOpen, setProfileOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const displayName = user?.nome || user?.email || "Usuário";
  const displayRole = user?.cargo || (user?.role ? ROLE_LABEL[user.role] : "");

  return (
    <>
      <div className="bg-white border-b border-gray-200 px-4 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Date */}
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

          {/* Right side */}
          <div className="flex items-center gap-2 lg:gap-4">
            {/* Name + role (desktop) */}
            <div className="hidden md:block text-right">
              <div className="text-sm font-medium text-[#424242]">{displayName}</div>
              <div className="text-xs text-[#717182]">{displayRole}</div>
            </div>

            {/* Avatar button — opens profile */}
            <button
              onClick={() => setProfileOpen(true)}
              className="w-10 h-10 bg-[#2E7D32] rounded-full flex items-center justify-center hover:bg-[#1B5E20] transition-colors"
              title="Ver perfil"
            >
              <User className="w-5 h-5 text-white" />
            </button>

            {/* Logout */}
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

      {/* Profile overlay */}
      {profileOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setProfileOpen(false)}
          />

          {/* Panel */}
          <div className="relative bg-white w-full sm:w-96 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 z-10 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-200">
            {/* Close */}
            <button
              onClick={() => setProfileOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-[#F5F5F5] text-[#717182] transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Avatar */}
            <div className="flex flex-col items-center mb-6">
              <div className="w-20 h-20 bg-[#2E7D32] rounded-full flex items-center justify-center mb-3 shadow-md">
                <User className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-xl font-bold text-[#424242]">{displayName}</h2>
              {user?.role && (
                <span className={`mt-1.5 inline-block text-xs font-semibold px-3 py-1 rounded-full ${ROLE_BADGE[user.role]}`}
                  style={{ background: user.role === 'admin' ? '#b91c1c22' : user.role === 'operador' ? '#1d4ed822' : '#0f766e22',
                           color: user.role === 'admin' ? '#991b1b' : user.role === 'operador' ? '#1e40af' : '#0f766e' }}>
                  {ROLE_LABEL[user.role]}
                </span>
              )}
            </div>

            {/* Info rows */}
            <div className="space-y-3">
              <InfoRow icon={Mail}      label="Email"  value={user?.email || "—"} />
              <InfoRow icon={Briefcase} label="Cargo"  value={user?.cargo || displayRole || "—"} />
              <InfoRow icon={Building2} label="Setor"  value={user?.setor || "—"} />
              <InfoRow icon={ShieldCheck} label="Perfil" value={user?.role ? ROLE_LABEL[user.role] : "—"} />
            </div>

            {/* Divider */}
            <div className="border-t border-[#F5F5F5] mt-6 pt-4">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium text-sm"
              >
                <LogOut className="w-4 h-4" />
                Sair da conta
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F5F5F5]">
      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
        <Icon className="w-4 h-4 text-[#2E7D32]" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-[#717182] uppercase tracking-wide font-medium">{label}</p>
        <p className="text-sm font-medium text-[#424242] truncate">{value}</p>
      </div>
    </div>
  );
}