import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PresenceProvider } from './hooks/usePresence';
import { ThemeProvider } from './context/ThemeContext';
import { WallpaperProvider } from './context/WallpaperContext';
import { AppearanceProvider } from './context/AppearanceContext';
import { CallProvider } from './context/CallContext';
import { SmoothScrollProvider } from './context/SmoothScroll';
import CallContainer from './components/calling/CallContainer';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Chat from './pages/Chat';
// Global Gajim design system — loaded once, available everywhere
import './styles/gajim/gajim-provided.css';

export default function App() {
  return (
    <AuthProvider>
      <CallProvider>
        <PresenceProvider>
          <ThemeProvider>
            <WallpaperProvider>
              <AppearanceProvider>
                <SmoothScrollProvider>
                  <CallContainer />
                  <Routes>
                {/* Full-screen Gajim Desktop Messenger route */}
                <Route
                  path="/chat"
                  element={
                    <ProtectedRoute>
                      <Chat />
                    </ProtectedRoute>
                  }
                />

                {/* Standard Website Pages with Top Navbar */}
                <Route
                  path="/*"
                  element={
                    <div className="app-container">
                      <Navbar />
                      <main style={{ minHeight: 'calc(100vh - 70px)' }}>
                        <Routes>
                          <Route path="/" element={<Home />} />
                          <Route path="/login" element={<Login />} />
                          <Route path="/register" element={<Register />} />
                        </Routes>
                      </main>
                    </div>
                  }
                />
              </Routes>
                </SmoothScrollProvider>
            </AppearanceProvider>
          </WallpaperProvider>
        </ThemeProvider>
      </PresenceProvider>
    </CallProvider>
  </AuthProvider>
  );
}
