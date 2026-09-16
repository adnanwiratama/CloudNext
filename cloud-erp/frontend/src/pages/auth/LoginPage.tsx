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

      {/* ═══════════ LEFT PANEL – Login Form ═══════════ */}
      <div className="w-full max-w-sm flex flex-col bg-white shadow-2xl">

        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-slate-100">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 flex items-center justify-center"
                 style={{ background: '#1e3a5f', borderRadius: '4px' }}>
              <span className="text-white text-sm font-black tracking-tight">CN</span>
            </div>
            <div>
              <div className="text-lg font-bold text-slate-900 leading-none">CloudNext</div>
              <div className="text-xs text-slate-400 leading-none mt-0.5">ERP Platform</div>
            </div>
          </div>

          <h2 className="text-xl font-semibold text-slate-900">Log In</h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-8 py-6 flex-1 space-y-4">

          {/* Company Code */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">Company Code</label>
            <input
              {...register('companyCode')}
              className="w-full px-3 py-2.5 border border-slate-300 text-sm rounded
                         focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
                         placeholder:text-slate-400"
              placeholder="e.g. CMI"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">Email address</label>
            <input
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
              })}
              type="email"
              autoComplete="username"
              className={`w-full px-3 py-2.5 border text-sm rounded
                         focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
                         placeholder:text-slate-400
                         ${errors.email ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
              placeholder="your@email.com"
            />
            {errors.email && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded-full bg-red-500 text-white text-center inline-flex items-center justify-center text-2xs leading-none">!</span>
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">Password</label>
            <div className="relative">
              <input
                {...register('password', { required: 'Password is required' })}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className={`w-full px-3 py-2.5 border text-sm rounded pr-10
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
                           placeholder:text-slate-400
                           ${errors.password ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
                placeholder="Your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded-full bg-red-500 text-white text-center inline-flex items-center justify-center text-2xs leading-none">!</span>
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Remember me */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="remember" className="w-3.5 h-3.5 accent-blue-600" defaultChecked />
            <label htmlFor="remember" className="text-sm text-slate-600">Remember Me</label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 flex items-center justify-center gap-2 text-sm font-medium
                       rounded text-white transition-colors"
            style={{ backgroundColor: loading ? '#94a3b8' : '#1e3a5f' }}
            onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#254d7a'; }}
            onMouseLeave={e => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#1e3a5f'; }}
          >
            {loading ? (
              <><Loader2 size={15} className="animate-spin" /> Signing In...</>
            ) : (
              <><Lock size={14} /> Log In</>
            )}
          </button>

          <div className="text-center">
            <button type="button" className="text-sm text-blue-600 hover:underline">
              Forgot your password?
            </button>
          </div>
        </form>

        {/* Demo credentials */}
        <div className="px-8 py-4 border-t border-slate-100 bg-blue-50">
          <p className="text-xs font-semibold text-blue-800 mb-1.5">Demo Access</p>
          <div className="text-xs text-blue-700 space-y-0.5 font-mono">
            <div>Company: <span className="font-bold">CMI</span></div>
            <div>Email: <span className="font-bold">admin@cloudmfg.co.id</span></div>
            <div>Password: <span className="font-bold">CloudERP@2026</span></div>
          </div>
        </div>

        <div className="px-8 py-3 text-center">
          <p className="text-xs text-slate-400">
            By logging in, you agree to the <span className="text-blue-500 cursor-pointer hover:underline">Terms of Use</span> and <span className="text-blue-500 cursor-pointer hover:underline">Privacy Policy</span>.
          </p>
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
