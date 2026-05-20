import { createBrowserRouter } from "react-router-dom";
import { Login } from "./pages/login";
import { Dashboard } from "./pages/dashboard";
import { RegisterWaste } from "./pages/register-waste";
import { TrackingMaterial } from "./pages/tracking-material";
import { MaterialManagement } from "./pages/material-management";
import { Reports } from "./pages/reports";
import { Settings } from "./pages/settings";
import { Layout } from "./components/layout";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/",
    Component: Layout,
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
