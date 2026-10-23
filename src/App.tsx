import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import Shell from './components/Shell';
import { Spinner } from './components/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TeamPage from './pages/TeamPage';
import GoalsPage from './pages/GoalsPage';
import ReviewsPage from './pages/ReviewsPage';
import PersonPage from './pages/PersonPage';
import AdminPage from './pages/AdminPage';

function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { me } = useAuth();
  if (!me || !roles.includes(me.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { me, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <Spinner />
      </div>
    );
  }
  if (!me) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/team"
          element={
            <RequireRole roles={['manager', 'admin']}>
              <TeamPage />
            </RequireRole>
          }
        />
        <Route
          path="/goals"
          element={
            <RequireRole roles={['manager', 'admin']}>
              <GoalsPage />
            </RequireRole>
          }
        />
        <Route
          path="/reviews"
          element={
            <RequireRole roles={['manager', 'admin']}>
              <ReviewsPage />
            </RequireRole>
          }
        />
        <Route path="/people/:id" element={<PersonPage />} />
        <Route
          path="/admin"
          element={
            <RequireRole roles={['admin']}>
              <AdminPage />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
