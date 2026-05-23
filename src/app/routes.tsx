import { createBrowserRouter } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { Login } from "./pages/login";
import { Dashboard } from "./pages/dashboard";
import { RegisterWaste } from "./pages/register-waste";
import { TrackingMaterial } from "./pages/tracking-material";
import { MaterialManagement } from "./pages/material-management";
import { Reports } from "./pages/reports";
import { Settings } from "./pages/settings";
import { Layout } from "./components/layout";

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
      { path: "register-waste", Component: RegisterWaste },
      { path: "tracking", Component: TrackingMaterial },
      { path: "materials", Component: MaterialManagement },
      { path: "reports", Component: Reports },
      { path: "settings", Component: Settings },
    ],
  },
]);
