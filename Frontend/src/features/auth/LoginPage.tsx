import { useState } from 'react';
import { Lock, Mail, Eye, EyeOff, LogIn, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import logoUrl from '@/assets/greenbidz_logo.png';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success('Signed in successfully');
      // On success the app re-renders into the dashboard (AuthGate).
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-bg px-4">
      {/* Ambient background accents */}
      {/* <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]" /> */}
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-sky-500/10 blur-[120px]" />

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        

        {/* Card */}
        <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
          <div className=" mt-3 flex flex-col items-center gap-3">
          <div className=" bg-white px-6 py-2  rounded-md ring-1 ring-black/5">
            <img src={logoUrl} alt="GreenBidz" className="h-11 w-auto" />
          </div>
          {/* <div className="flex items-center gap-1.5 rounded-full border border-line bg-panel2/60 px-3 py-1 text-[11px] font-medium text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            Scraper Admin · administrators only
          </div> */}
        </div>
          {/* Accent top bar */}
          {/* <div className="h-1 w-full bg-gradient-to-r from-accent via-emerald-400 to-sky-400" /> */}

          <div className="px-4 py-6">
            <h1 className="text-xl text-center font-bold text-ink">Welcome back</h1>
            <p className="mt-1 text-xs text-center text-muted">
              Sign in with your  admin account to access the scraper.
            </p>

            {error && (
              <div className="mt-5 flex items-start gap-2 rounded-lg border border-danger/30 bg-red-900/20 p-3 text-xs text-red-300 light:bg-red-50 light:text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type="email"
                    className="input h-11 pl-9"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input h-11 pl-9 pr-10"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-ink"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="h-11 w-full"
                loading={loading}
                disabled={loading || !email || !password}
                icon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </div>
        </div>

       
      </div>
    </div>
  );
}
