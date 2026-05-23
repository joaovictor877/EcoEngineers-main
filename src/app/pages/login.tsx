import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Recycle } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data } = await api.post<{ token: string }>("/api/login", {
        email,
        password,
      });

      if (!data?.token) {
        toast.error("Resposta de login inválida");
        return;
      }

      localStorage.setItem("token", data.token);
      toast.success("Login realizado com sucesso");
      navigate("/");
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        "Falha no login. Verifique email e senha.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2E7D32] to-[#66BB6A] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#2E7D32] rounded-2xl flex items-center justify-center mb-4">
            <Recycle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#424242]">EcoEngineers</h1>
          <p className="text-sm text-[#717182] mt-1">
            Sistema de Logística Reversa
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm text-[#424242] mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
              placeholder="seu@email.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-[#424242] mb-2">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-[#F5F5F5] border border-transparent focus:border-[#2E7D32] focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20 transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#2E7D32] hover:bg-[#1B5E20] text-white py-3 rounded-lg transition-colors font-medium"
          >
            {isLoading ? "Entrando..." : "Entrar"}
          </button>

          <button
            type="button"
            className="w-full text-[#2E7D32] hover:text-[#1B5E20] text-sm transition-colors"
          >
            Esqueci minha senha
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-[#F5F5F5] text-center">
          <p className="text-xs text-[#717182]">
            Gestão de Resíduos Industriais
          </p>
        </div>
      </div>
    </div>
  );
}
