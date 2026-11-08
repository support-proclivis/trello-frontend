import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import BoardPage from "./pages/BoardPage.jsx";
import Profile from "./pages/Profile.jsx";
import Members from "./pages/Members.jsx";
import InviteAccept from "./pages/InviteAccept.jsx";

function Protected({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api("/api/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, [loc.pathname]);

  if (!ready) return <div className="page">Loading...</div>;
  if (!getToken()) return <Navigate to="/login" replace />;
  return children({ user, setUser });
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/invite/:token" element={<InviteAccept />} />
      <Route
        path="/"
        element={
          <Protected>
            {(ctx) => <Dashboard {...ctx} />}
          </Protected>
        }
      />
      <Route
        path="/board/:id"
        element={
          <Protected>
            {(ctx) => <BoardPage {...ctx} />}
          </Protected>
        }
      />
      <Route
        path="/profile"
        element={
          <Protected>
            {(ctx) => <Profile {...ctx} />}
          </Protected>
        }
      />
      <Route
        path="/workspaces/:id/members"
        element={
          <Protected>
            {(ctx) => <Members {...ctx} />}
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
