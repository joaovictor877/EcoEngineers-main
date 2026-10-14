import { useEffect, useState } from "react";
import { BellRing, BellOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  AlertPrefs, getAlertPrefs, setAlertPrefs, ativarPush, desativarPush, pushAtivo, pushSuportado,
} from "../lib/alerts";

const OPCOES: { key: keyof AlertPrefs; label: string; description: string }[] = [
  {
    key: "reprovacoes",
    label: "Alerta de caixa reprovada",
    description: "Aviso imediato, em qualquer tela, quando item, peso e QR Code divergem",
  },
  {
    key: "som",
    label: "Som no alerta",
    description: "Bipe curto junto do aviso de reprovação",
  },
  {
    key: "hardware",
    label: "Alertas de hardware",
    description: "Avisos sobre balança e câmera do posto",
  },
];

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<AlertPrefs>(getAlertPrefs);
  const [push, setPush] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => { pushAtivo().then(setPush).catch(() => setPush(false)); }, []);

  const alternar = (key: keyof AlertPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setAlertPrefs(next);
  };

  const alternarPush = async () => {
    setCarregando(true);
    try {
      if (push) {
        await desativarPush();
        setPush(false);
        toast.success("Alertas neste aparelho desativados.");
      } else {
        await ativarPush();
        setPush(true);
        toast.success("Pronto! Este aparelho recebe alertas mesmo com o app fechado.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível ativar as notificações");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-[#424242] mb-6">Preferências de Notificação</h2>

      <div className="mb-6 p-4 rounded-xl border border-[#2E7D32]/20 bg-[#2E7D32]/5 flex flex-col md:flex-row md:items-center gap-4">
        <Smartphone className="w-8 h-8 text-[#2E7D32] flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#424242]">Alertas no celular com o app fechado</p>
          <p className="text-xs text-[#717182] mt-1">
            {pushSuportado()
              ? "Recebe uma notificação do sistema a cada caixa reprovada. No celular, instale o app pela opção \"Adicionar à tela inicial\" antes de ativar."
              : "Este navegador não suporta notificações push."}
          </p>
        </div>
        <button
          onClick={alternarPush}
          disabled={carregando || !pushSuportado()}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-60 ${push ? "bg-white border border-gray-200 text-[#424242] hover:bg-gray-50" : "bg-[#2E7D32] hover:bg-[#1B5E20] text-white"}`}
        >
          {push ? <BellOff className="w-4 h-4" /> : <BellRing className="w-4 h-4" />}
          {carregando ? "..." : push ? "Desativar neste aparelho" : "Ativar neste aparelho"}
        </button>
      </div>

      <div className="space-y-4">
        {OPCOES.map((item) => (
          <label
            key={item.key}
            className="flex items-start gap-3 p-4 rounded-lg hover:bg-[#F5F5F5] transition-colors cursor-pointer"
          >
            <input
              type="checkbox"
              checked={prefs[item.key]}
              onChange={() => alternar(item.key)}
              className="mt-1 w-5 h-5 rounded border-gray-300 text-[#2E7D32] focus:ring-[#2E7D32]"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-[#424242]">{item.label}</div>
              <div className="text-xs text-[#717182] mt-1">{item.description}</div>
            </div>
          </label>
        ))}
      </div>
      <p className="text-xs text-[#717182] mt-4">As preferências são salvas automaticamente neste aparelho.</p>
    </div>
  );
}

/** Botão compacto para o gestor ativar o alerta no celular direto da tela de expedição. */
export function PushButton() {
  const [push, setPush] = useState(false);
  const [carregando, setCarregando] = useState(false);
  useEffect(() => { pushAtivo().then(setPush).catch(() => setPush(false)); }, []);
  if (!pushSuportado()) return null;

  const alternar = async () => {
    setCarregando(true);
    try {
      if (push) { await desativarPush(); setPush(false); toast.success("Alertas neste aparelho desativados."); }
      else { await ativarPush(); setPush(true); toast.success("Este aparelho recebe alertas mesmo com o app fechado."); }
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível ativar as notificações");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <button
      onClick={alternar}
      disabled={carregando}
      title={push ? "Desativar alertas neste aparelho" : "Receber alerta de caixa reprovada mesmo com o app fechado"}
      className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-60 ${push ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-[#2E7D32] text-white hover:bg-[#1B5E20]"}`}
    >
      {push ? <BellRing className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
      {push ? "Alertas ativos" : "Alertas no celular"}
    </button>
  );
}
