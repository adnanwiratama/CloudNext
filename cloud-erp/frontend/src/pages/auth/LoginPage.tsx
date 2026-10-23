import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2, Lock, TrendingUp, BarChart2, Package, ShoppingCart } from 'lucide-react';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

interface LoginForm { email: string; password: string; companyCode?: string; }

// Feature cards untuk right panel
const FEATURES = [
  {
    icon: <TrendingUp size={20} className="text-blue-400" />,
    title: 'End-to-End ERP',
    desc: 'Sales, Purchasing, Manufacturing, Inventory, and Financial all in one platform.',
  },
  {
    icon: <BarChart2 size={20} className="text-teal-400" />,
    title: 'Real-Time Analytics',
    desc: 'Live dashboards with KPIs, aging reports, and financial insights.',
  },
  {
    icon: <Package size={20} className="text-amber-400" />,
    title: 'Inventory Control',
    desc: 'Multi-location stock management with lot tracking and reorder alerts.',
  },
  {
    icon: <ShoppingCart size={20} className="text-emerald-400" />,
    title: 'Complete Workflows',
    desc: 'SO → Fulfillment → Invoice → Payment. PO → Receipt → Bill → Payment.',
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    defaultValues: {
      email: 'admin@cloudmfg.co.id',
      password: 'CloudERP@2026',
      companyCode: 'CMI',
    },
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      const res = await api.post('/api/auth/login', data);
      const { user, token, refreshToken } = res.data.data;
      setAuth(user, token, refreshToken);
      toast.success(`Welcome, ${user.name}`);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#0f1f35' }}>

      {/* ═══════════ LEFT PANEL – Login Card (dark translucent, NetSuite-style) ═══════════ */}
      <div className="w-full max-w-md flex items-center p-8 flex-shrink-0">
        <div className="w-full rounded-xl border border-white/10 shadow-2xl p-8 backdrop-blur-md"
             style={{ backgroundColor: 'rgba(15, 31, 53, 0.55)' }}>

          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <img src="/cloudnext-logo.png" alt="CloudNext ERP"
              className="h-12 max-w-[260px] object-contain bg-white/90 rounded px-2 py-1"
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                img.style.display = 'none';
                (img.nextElementSibling as HTMLElement | null)?.style.setProperty('display', 'flex');
              }} />
            {/* Fallback text (shown only if the logo image is missing) */}
            <div className="items-center gap-2.5" style={{ display: 'none' }}>
              <div className="w-9 h-9 flex items-center justify-center" style={{ background: '#2563eb', borderRadius: '4px' }}>
                <span className="text-white text-sm font-black tracking-tight">CN</span>
              </div>
              <div>
                <div className="text-lg font-bold text-white leading-none">CloudNext</div>
                <div className="text-xs text-slate-400 leading-none mt-0.5">ERP Platform</div>
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-semibold text-white mb-6">Log In</h2>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Company Code */}
            <div className="rounded border border-white/15 bg-white/5 px-3 py-2 focus-within:border-blue-400 transition-colors">
              <label className="block text-2xs font-medium text-slate-300 uppercase tracking-wide">Company Code</label>
              <input
                {...register('companyCode')}
                className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 outline-none mt-0.5"
                placeholder="e.g. CMI"
              />
            </div>

            {/* Email */}
            <div>
              <div className={`rounded border px-3 py-2 transition-colors bg-white/5
                ${errors.email ? 'border-red-400/70' : 'border-white/15 focus-within:border-blue-400'}`}>
                <label className="block text-2xs font-medium text-slate-300 uppercase tracking-wide">Email address</label>
                <input
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
                  })}
                  type="email"
                  autoComplete="username"
                  className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 outline-none mt-0.5"
                  placeholder="your@email.com"
                />
              </div>
              {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <div className={`relative rounded border px-3 py-2 transition-colors bg-white/5
                ${errors.password ? 'border-red-400/70' : 'border-white/15 focus-within:border-blue-400'}`}>
                <label className="block text-2xs font-medium text-slate-300 uppercase tracking-wide">Password</label>
                <input
                  {...register('password', { required: 'Password is required' })}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 outline-none mt-0.5 pr-8"
                  placeholder="Your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" id="remember" className="w-4 h-4 accent-blue-500" defaultChecked />
              <label htmlFor="remember" className="text-sm text-slate-200">Remember Me</label>
            </div>

            {/* Submit – white button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 flex items-center justify-center gap-2 text-sm font-semibold
                         rounded bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-70 transition-colors"
            >
              {loading ? (
                <><Loader2 size={15} className="animate-spin" /> Signing In...</>
              ) : (
                <><Lock size={14} /> Log In</>
              )}
            </button>

            <div>
              <button type="button" className="text-sm text-amber-300 hover:underline">
                Forgot your password?
              </button>
            </div>

            <p className="text-xs text-slate-400 pt-2 leading-relaxed">
              By clicking on the Log In button, you understand and agree to the{' '}
              <span className="text-amber-300 cursor-pointer hover:underline">Terms of Use</span> and{' '}
              <span className="text-amber-300 cursor-pointer hover:underline">Privacy Policy</span>.
            </p>
          </form>
        </div>
      </div>

      {/* ═══════════ RIGHT PANEL – Feature showcase ═══════════ */}
      <div className="flex-1 flex flex-col justify-between p-10 relative overflow-hidden"
           style={{ background: 'linear-gradient(135deg, #0f1f35 0%, #1e3a5f 50%, #0e2a4a 100%)' }}>

        {/* Background decorative circles */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-5"
             style={{ background: '#60a5fa', transform: 'translate(40%, -40%)' }} />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-5"
             style={{ background: '#34d399', transform: 'translate(-30%, 30%)' }} />

        {/* Content */}
        <div className="relative z-10">
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-white leading-tight mb-3">
              CloudNext ERP.<br />
              <span style={{ color: '#60a5fa' }}>Powered for Enterprise.</span>
            </h1>
            <p className="text-slate-400 text-base max-w-md">
              A complete enterprise resource planning platform for manufacturing,
              trading, and distribution companies in Indonesia.
            </p>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-2 gap-3 max-w-xl">
            {FEATURES.map((f, i) => (
              <div key={i}
                   className="p-4 border border-white/10 rounded"
                   style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <div className="mb-2">{f.icon}</div>
                <div className="text-white text-sm font-semibold mb-1">{f.title}</div>
                <div className="text-slate-400 text-xs leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Company info bar */}
        <div className="relative z-10 flex items-center justify-between pt-8 border-t border-white/10">
          <div>
            <div className="text-white text-sm font-semibold">PT Cloud Plus Internasional</div>
            <div className="text-slate-500 text-xs">CloudNext v1.0 · Enterprise Resource Planning</div>
          </div>
          <div className="flex items-center gap-3">
            {['Sales', 'Purchasing', 'Inventory', 'Finance', 'Manufacturing'].map(m => (
              <span key={m} className="text-xs text-slate-500">{m}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
