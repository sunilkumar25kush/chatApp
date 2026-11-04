import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTheme } from '../context/ThemeContext';
import { GoogleLogin } from '@react-oauth/google';
import api from '../services/api';
import { connectSocket } from '../services/socket';
import { AuthUI } from '../components/ui/auth-ui';
import toast from '../utils/toast';

export default function Login() {
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, error: serverError, setError } = useAuth();
  const { resolvedMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectPath = location.state?.from?.pathname || '/chat';

  const validateForm = (email, password) => {
    if (!email.trim()) {
      return 'Email address is required';
    }
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }
    if (!password) {
      return 'Password is required';
    }
    return null;
  };

  const handleSignIn = async ({ email, password }) => {
    setValidationError('');
    setError(null);

    const errorMsg = validateForm(email, password);
    if (errorMsg) {
      setValidationError(errorMsg);
      toast.error('Validation Error', { description: errorMsg });
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        toast.success('Welcome back!', { description: 'Logged in successfully.' });
        navigate(redirectPath, { replace: true });
      } else if (result.error) {
        toast.error('Login Failed', { description: result.error });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Google OAuth flow
  const googleSuccessHandler = async (credentialResponse) => {
    const idToken = credentialResponse?.credential;
    if (!idToken) {
      setError('Google sign-in failed. No credential returned.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await api.post('/auth/google', { idToken });
      const { token, ...userData } = response.data;
      if (token) localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));

      connectSocket(token || undefined);
      window.location.href = redirectPath;
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Google login failed.';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = validationError || serverError;

  return (
    <AuthUI
      fullHeight={false}
      initialMode="signin"
      error={activeError}
      submitting={submitting}
      onSignIn={handleSignIn}
      signUpHref="/register"
      brand={
        <div className="mb-4 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            <span aria-hidden="true">✦</span> ChatRoom
          </span>
        </div>
      }
      signInContent={{
        image: {
          src: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1600&q=80',
          alt: 'A team collaborating around a table',
        },
        quote: {
          text: 'Welcome back. Your rooms are waiting.',
          author: 'ChatRoom',
        },
      }}
      signUpContent={{
        image: {
          src: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=80',
          alt: 'A group of people starting something new together',
        },
        quote: {
          text: 'Create an account. A new chapter awaits.',
          author: 'ChatRoom',
        },
      }}
      googleSlot={
        <div className="google-auth-wrapper">
          <GoogleLogin
            onSuccess={(credentialResponse) => {
              setValidationError('');
              setError(null);
              googleSuccessHandler(credentialResponse);
            }}
            onError={() => setError('Google Sign-In failed. Please try again.')}
            theme={resolvedMode === 'dark' ? 'filled_black' : 'outline'}
            shape="pill"
            text="signin_with"
            size="large"
            width="100%"
          />
        </div>
      }
    />
  );
}
