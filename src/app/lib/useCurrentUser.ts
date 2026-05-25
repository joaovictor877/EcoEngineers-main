export type UserRole = 'admin' | 'operador' | 'gestor';

export interface CurrentUser {
  id: number;
  email: string;
  role: UserRole;
  nome: string;
  cargo: string;
  setor: string;
}

/** Decodes the JWT from localStorage without verifying the signature (verification is server-side). */
export function useCurrentUser(): CurrentUser | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return {
      id:    payload.id    ?? 0,
      email: payload.email ?? '',
      role:  (payload.role as UserRole) ?? 'operador',
      nome:  payload.nome  ?? payload.email ?? '',
      cargo: payload.cargo ?? '',
      setor: payload.setor ?? '',
    };
  } catch {
    return null;
  }
}

/** Returns true if the current user has access to the given page route. */
export function canAccess(role: UserRole | undefined, path: string): boolean {
  if (!role) return false;
  if (role === 'admin') return true;
  const operadorRoutes = ['/', '/register-waste', '/tracking'];
  const gestorRoutes   = ['/', '/tracking', '/reports'];
  if (role === 'operador') return operadorRoutes.includes(path);
  if (role === 'gestor')   return gestorRoutes.includes(path);
  return false;
}

/** Returns the label for a role. */
export const ROLE_LABEL: Record<UserRole, string> = {
  admin:    'Administrador',
  operador: 'Operador ESG',
  gestor:   'Gestor Ambiental',
};

/** Returns Tailwind classes for the role badge in the sidebar. */
export const ROLE_BADGE: Record<UserRole, string> = {
  admin:    'bg-red-800/40 text-red-200',
  operador: 'bg-blue-800/40 text-blue-200',
  gestor:   'bg-teal-800/40 text-teal-200',
};
