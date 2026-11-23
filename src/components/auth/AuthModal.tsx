import { useState } from 'react';
import { X, Lock, Mail, User, AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/store/authStore';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup' | 'reset';
}

export function AuthModal({ isOpen, onClose, initialMode = 'signin' }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const resetPassword = useAuthStore((s) => s.resetPassword);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!email || !email.includes('@')) {
      setFormError('Please enter a valid email address');
      return;
    }

    if (mode === 'reset') {
      setSubmitting(true);
      const res = await resetPassword(email);
      setSubmitting(false);
      if (res.success) {
        setSuccessMessage('Password reset instructions sent to your email.');
      } else {
        setFormError(res.error || 'Failed to send reset email');
      }
      return;
    }

    if (!password || password.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setFormError('Passwords do not match');
        return;
      }

      setSubmitting(true);
      const res = await signUp(email, password, displayName);
      setSubmitting(false);

      if (res.success) {
        setSuccessMessage('Account created! Please check your email to verify your address or sign in.');
        setTimeout(() => {
          setMode('signin');
          setSuccessMessage(null);
        }, 2500);
      } else {
        setFormError(res.error || 'Registration failed');
      }
      return;
    }

    // Sign in mode
    setSubmitting(true);
    const res = await signIn(email, password);
    setSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setFormError(res.error || 'Invalid email or password');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-md rounded-xl border border-[#2a2a3e] bg-[#141420] p-6 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#202034] transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-3">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-gray-100">
            {mode === 'signin' && 'Sign in to FlowForge'}
            {mode === 'signup' && 'Create your account'}
            {mode === 'reset' && 'Reset your password'}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {mode === 'signin' && 'Enter your credentials to access your workflows and workspaces'}
            {mode === 'signup' && 'Get started with collaborative cloud workflow automation'}
            {mode === 'reset' && "We'll send you an email with a link to reset your password"}
          </p>
        </div>

        {/* Alerts */}
        {formError && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Display Name</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  type="text"
                  placeholder="e.g. Alex Morgan"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="pl-9 bg-[#1a1a2c] border-[#2e2e46]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                type="email"
                required
                placeholder="developer@flowforge.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9 bg-[#1a1a2c] border-[#2e2e46]"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-300">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('reset');
                      setFormError(null);
                    }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 bg-[#1a1a2c] border-[#2e2e46]"
                />
              </div>
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-9 bg-[#1a1a2c] border-[#2e2e46]"
                />
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 mt-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {mode === 'signin' && 'Sign In'}
                {mode === 'signup' && 'Create Account'}
                {mode === 'reset' && 'Send Reset Link'}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        {/* OAuth Section */}
        {mode !== 'reset' && (
          <div className="mt-5 pt-4 border-t border-[#242438]">
            <Button
              type="button"
              variant="outline"
              disabled={googleLoading}
              onClick={async () => {
                setFormError(null);
                setGoogleLoading(true);
                const res = await signInWithGoogle();
                // If the OAuth call itself errors (e.g. provider not enabled in Supabase),
                // show the actual error from Supabase rather than a static message.
                if (!res.success && res.error) {
                  setFormError(res.error);
                  setGoogleLoading(false);
                }
                // On success: browser navigates away to Google; googleLoading stays true
                // while the redirect is in flight.
              }}
              className="w-full border-[#2e2e46] bg-[#181828] hover:bg-[#202034] text-xs text-gray-300 flex items-center justify-center gap-2"
            >
              {googleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              Continue with Google
            </Button>
          </div>
        )}

        {/* Switch Mode Footer */}
        <div className="mt-5 text-center text-xs text-gray-400">
          {mode === 'signin' && (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setFormError(null);
                }}
                className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors ml-1"
              >
                Sign up
              </button>
            </p>
          )}

          {mode === 'signup' && (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setFormError(null);
                }}
                className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors ml-1"
              >
                Sign in
              </button>
            </p>
          )}

          {mode === 'reset' && (
            <p>
              Remember your password?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setFormError(null);
                }}
                className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors ml-1"
              >
                Back to Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
