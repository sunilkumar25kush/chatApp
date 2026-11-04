import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
// Scoped Tailwind utilities for the shadcn-style auth UI (src/components/ui).
import './styles/tailwind.css';
import './pwa-register';

// Google OAuth client ID.
// VITE_GOOGLE_CLIENT_ID is injected at build time (Vercel/Render dashboard).
// Fallback keeps the login page working if the env var wasn't configured.
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '198016649152-gsu4t27m9o47ovbho2eg0fefr42588rq.apps.googleusercontent.com';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {clientId ? (
        <GoogleOAuthProvider clientId={clientId}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
          </BrowserRouter>
        </GoogleOAuthProvider>
      ) : (
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
        </BrowserRouter>
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
