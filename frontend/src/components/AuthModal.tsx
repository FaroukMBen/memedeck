import { useState, type FormEvent } from 'react';
import { LogIn, UserPlus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup';
}

export function AuthModal({ isOpen, onClose, defaultMode = 'signin' }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>(defaultMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const trimmedUsername = username.trim();
        if (!trimmedUsername) {
          throw new Error('Username is required');
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              username: trimmedUsername,
            },
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        // If email confirmation is disabled in Supabase, session is active immediately
        if (data.session) {
          onClose();
        } else {
          // If confirmation is still enabled on their Supabase project, advise them
          setError('Account created! Note: if email confirmation is required by your Supabase project, please confirm your email or disable confirmation in Supabase dashboard.');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) {
          throw signInError;
        }

        onClose();
      }
    } catch (err: any) {
      setError(err?.message ?? 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'signin' ? 'Connect to MemeDeck' : 'Create an Account'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-tabs">
          <button
            type="button"
            className={`modal-tab ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => {
              setMode('signin');
              setError(null);
            }}
          >
            <LogIn size={15} />
            Sign In
          </button>
          <button
            type="button"
            className={`modal-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
          >
            <UserPlus size={15} />
            Create Account
          </button>
        </div>

        {error && <div className="modal-alert error">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-form">
          {mode === 'signup' && (
            <label className="form-group">
              <span>Username</span>
              <input
                type="text"
                required
                minLength={3}
                maxLength={30}
                placeholder="e.g. meme_master"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </label>
          )}

          <label className="form-group">
            <span>Email</span>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="form-group">
            <span>Password</span>
            <input
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </label>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading
              ? 'Processing...'
              : mode === 'signin'
              ? 'Connect'
              : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

