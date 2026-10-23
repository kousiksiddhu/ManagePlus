import { CalendarRange, LayoutDashboard, LogOut, ShieldCheck, Target, User, Users } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { THEMES } from '../theme/themes';
import { Avatar, Badge } from './ui';

export default function Shell() {
  const { me, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  if (!me) return null;

  const isManager = me.role === 'manager' || me.role === 'admin';

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-mark">M</span>
          ManagePlus
        </div>

        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <LayoutDashboard size={17} /> Dashboard
        </NavLink>
        {isManager && (
          <>
            <NavLink to="/team" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Users size={17} /> My Team
            </NavLink>
            <NavLink to="/goals" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Target size={17} /> Goals
            </NavLink>
            <NavLink to="/reviews" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <CalendarRange size={17} /> Reviews
            </NavLink>
          </>
        )}
        <NavLink
          to={`/people/${me.employeeId}`}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <User size={17} /> My Profile
        </NavLink>
        {me.role === 'admin' && (
          <NavLink to="/admin" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <ShieldCheck size={17} /> Admin
          </NavLink>
        )}

        <div className="sidebar-footer">
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">Theme</span>
            <select className="select" value={theme} onChange={(e) => setTheme(e.target.value)}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Avatar name={me.name} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {me.name}
              </div>
              <Badge tone={me.role === 'admin' ? 'danger' : me.role === 'manager' ? 'accent' : 'neutral'}>
                {me.role}
              </Badge>
            </div>
            <button className="icon-btn" onClick={() => void logout()} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
