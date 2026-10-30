import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { CameraView } from './pages/CameraView';
import { WardrobeView } from './pages/WardrobeView';
import { InsightsView } from './pages/InsightsView';
import { InstructionsView } from './pages/InstructionsView';
import { RegisterView } from './pages/RegisterView';
import { LoginView } from './pages/LoginView';
import { WardrobeProvider } from './contexts/WardrobeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';

/** Redirect to /login if not authenticated (after initial load). */
const ProtectedRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const { user, loading } = useAuth();
  if (loading) return null; // wait for session check
  if (!user) return <Navigate to="/login" replace />;
  return element;
};

/** Redirect to / if already authenticated (for login/register pages). */
const GuestRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return element;
};

const AppRoutes: React.FC = () => (
  <HashRouter>
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-primary-200 selection:text-primary-900">
      <Navbar />
      <main>
        <Routes>
          <Route path="/login"    element={<GuestRoute element={<LoginView />} />} />
          <Route path="/register" element={<GuestRoute element={<RegisterView />} />} />
          <Route path="/"           element={<ProtectedRoute element={<CameraView />} />} />
          <Route path="/wardrobe"   element={<ProtectedRoute element={<WardrobeView />} />} />
          <Route path="/insights"   element={<ProtectedRoute element={<InsightsView />} />} />
          <Route path="/instructions" element={<ProtectedRoute element={<InstructionsView />} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  </HashRouter>
);

const App: React.FC = () => (
  <AuthProvider>
    <WardrobeProvider>
      <AppRoutes />
    </WardrobeProvider>
  </AuthProvider>
);

export default App;
