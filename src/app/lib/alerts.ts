import api from "./api";

/**
 * Alertas de caixa reprovada para o gestor:
 *  - com o app aberto em qualquer tela: toast + notificação do sistema
 *    (quando a aba está em segundo plano);
 *  - com o app fechado: Web Push pelo service worker (PWA instalado).
 */

const PREFS_KEY = "alert_prefs";

export interface AlertPrefs {
  reprovacoes: boolean;   // toast + notificação ao reprovar uma caixa
  hardware: boolean;      // avisos de balança/câmera
  som: boolean;           // bipe curto junto do alerta
}

const DEFAULT_PREFS: AlertPrefs = { reprovacoes: true, hardware: true, som: true };

export function getAlertPrefs(): AlertPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setAlertPrefs(prefs: AlertPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* armazenamento indisponível */ }
}

export function bipe() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch { /* sem áudio */ }
}

/** Notificação do sistema operacional, usada quando a aba não está em foco. */
export async function notificarSistema(title: string, body: string, url = "/tracking") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag: url + title, data: { url }, icon: "/pwa-192x192.png" });
    else new Notification(title, { body, icon: "/pwa-192x192.png" });
  } catch { /* navegador sem suporte */ }
}

function base64UrlToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSuportado() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function pushAtivo(): Promise<boolean> {
  if (!pushSuportado()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

/** Pede permissão e inscreve este aparelho para receber alertas com o app fechado. */
export async function ativarPush(): Promise<void> {
  if (!pushSuportado()) throw new Error("Este navegador não suporta notificações push. No celular, instale o app (Adicionar à tela inicial).");
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") throw new Error("Permissão de notificação negada.");
  const reg = await navigator.serviceWorker.ready;
  const { data } = await api.get<{ publicKey: string }>("/api/push/chave-publica");
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(data.publicKey) }));
  await api.post("/api/push/inscrever", sub.toJSON());
}

export async function desativarPush(): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.post("/api/push/cancelar", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}
