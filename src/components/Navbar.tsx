import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { User, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${
      isActive ? 'text-stone-900 font-medium' : 'text-stone-400 hover:text-stone-600'
    }`;

  return (
    <nav className="sticky top-0 z-50 w-full bg-[#fafaf9]/90 backdrop-blur-md border-b border-stone-100 h-20 flex items-center justify-between px-8 lg:px-16">
      <div className="flex items-center gap-3">
        <span className="font-serif italic text-2xl text-stone-900">WearWise.</span>
      </div>

      {user && (
        // Order updated after the 3rd user interview: Insights now precedes
        // Wardrobe so users can access their stats more quickly.
        <div className="flex items-center gap-8">
          <NavLink to="/" className={linkClass}>
            <span className="text-xs font-bold uppercase tracking-widest">Log a look</span>
          </NavLink>
          <NavLink to="/insights" className={linkClass}>
            <span className="text-xs font-bold uppercase tracking-widest">Insights</span>
          </NavLink>
          <NavLink to="/wardrobe" className={linkClass}>
            <span className="text-xs font-bold uppercase tracking-widest">Wardrobe</span>
          </NavLink>
          <NavLink to="/instructions" className={linkClass}>
            <span className="text-xs font-bold uppercase tracking-widest">Instructions</span>
          </NavLink>
        </div>
      )}

      <div className="flex items-center gap-3">
        {user ? (
          <>
            <span className="text-xs text-stone-400 font-medium hidden sm:block truncate max-w-[140px]" title={user.email}>
              {user.username || user.email}
            </span>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="w-10 h-10 rounded-full border border-stone-200 flex items-center justify-center text-stone-400 hover:border-stone-900 hover:text-stone-900 transition-all"
            >
              <LogOut size={16} />
            </button>
          </>
        ) : (
          <NavLink to="/login" className="w-10 h-10 rounded-full border border-stone-200 flex items-center justify-center text-stone-400 hover:border-stone-900 hover:text-stone-900 transition-all">
            <User size={18} />
          </NavLink>
        )}
      </div>
    </nav>
  );
};
