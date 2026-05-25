import { createBrowserRouter, Navigate } from "react-router-dom";
import { Login } from "./pages/login";
import { Dashboard } from "./pages/dashboard";
import { RegisterWaste } from "./pages/register-waste";
import { TrackingMaterial } from "./pages/tracking-material";
import { MaterialManagement } from "./pages/material-management";
import { Reports } from "./pages/reports";
import { Settings } from "./pages/settings";
import { Layout } from "./components/layout";
import { canAccess, useCurrentUser } from "./lib/useCurrentUser";

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function LoginRoute() {
  const token = localStorage.getItem("token");
  if (token) return <Navigate to="/" replace />;
  return <Login />;
}

/** Redirects to dashboard if user doesn't have access to this route. */
function RequireRole({ children, path }: { children: JSX.Element; path: string }) {
  const user = useCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccess(user.role, path)) return <Navigate to="/" replace />;
  return children;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: LoginRoute,
  },
  {
    path: "/",
    Component: () => (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, Component: Dashboard },
      {
        path: "register-waste",
        Component: () => <RequireRole path="/register-waste"><RegisterWaste /></RequireRole>,
      },
      {
        path: "tracking",
        Component: () => <RequireRole path="/tracking"><TrackingMaterial /></RequireRole>,
      },
      {
        path: "materials",
        Component: () => <RequireRole path="/materials"><MaterialManagement /></RequireRole>,
      },
      {
        path: "reports",
        Component: () => <RequireRole path="/reports"><Reports /></RequireRole>,
      },
      {
        path: "settings",
        Component: () => <RequireRole path="/settings"><Settings /></RequireRole>,
      },
    ],
  },
]);
