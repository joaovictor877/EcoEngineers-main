import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Recycle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("session_expired")) {
      toast.error("Sessão expirada. Faça login novamente.");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setEmailError("");
    setPasswordError("");
    setIsLoading(true);
    try {
      const { data } = await api.post<{ token: string }>("/api/login", {
        email,
        password,
      });
      if (!data?.token) {
        setPasswordError("Resposta de login inválida.");
        return;
      }
      localStorage.setItem("token", data.token);
      navigate("/");
    } catch (error: any) {
      const code = error?.response?.data?.code;
      const msg  = error?.response?.data?.error || "Falha no login. Verifique seus dados.";
      if (code === "EMAIL_NOT_FOUND") {
        setEmailError(msg);
      } else {
        setPasswordError(msg);
        // Keep email so user only needs to retype password
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fieldBase = "w-full px-4 py-3 rounded-lg bg-[#F5F5F5] border focus:outline-none focus:ring-2 transition-all";
  const fieldOk   = `${fieldBase} border-transparent focus:border-[#2E7D32] focus:ring-[#2E7D32]/20`;
  const fieldErr  = `${fieldBase} border-red-400 focus:border-red-500 focus:ring-red-200 bg-red-50`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2E7D32] to-[#66BB6A] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#2E7D32] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Recycle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#424242]">EcoEngineers</h1>
          <p className="text-sm text-[#717182] mt-1">Sistema de Logística Reversa</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#424242] mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
              className={emailError ? fieldErr : fieldOk}
              placeholder="seu@email.com"
              autoComplete="email"
              required
            />
            {emailError && (
              <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                <span className="inline-block w-3.5 h-3.5 rounded-full bg-red-500 text-white text-center leading-3.5 font-bold text-[9px]">!</span>
                {emailError}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#424242] mb-2">
              Senha
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                className={`${passwordError ? fieldErr : fieldOk} pr-12`}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#717182] hover:text-[#424242] transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {passwordError && (
              <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                <span className="inline-block w-3.5 h-3.5 rounded-full bg-red-500 text-white text-center leading-3.5 font-bold text-[9px]">!</span>
                {passwordError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#2E7D32] hover:bg-[#1B5E20] disabled:opacity-60 disabled:cursor-not-allowed text-white py-3 rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
          >
            {isLoading && (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            )}
            {isLoading ? "Autenticando..." : "Entrar"}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-[#F5F5F5] text-center">
          <p className="text-xs text-[#717182]">Gestão de Resíduos Industriais</p>
        </div>
      </div>
    </div>
  );
}
