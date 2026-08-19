import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchMe } from '../services/adminApi';
import AnimatedBackground from '../components/AnimatedBackground';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function checkExistingSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setLoading(true);
        try {
          const user = await fetchMe();
          if (user.role === 'admin') {
            navigate('/dashboard');
          } else {
            navigate('/daily-record');
          }
        } catch (err) {
          console.log('ตรวจพบเซสชัน Supabase แต่เรียกข้อมูลโปรไฟล์ไม่สำเร็จ (อาจเพราะ API ออฟไลน์ หรือไม่มีสิทธิ์):', err);
        } finally {
          setLoading(false);
        }
      }
    }
    checkExistingSession();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      // ตรวจสอบสิทธิ์ผู้ใช้งาน
      try {
        const user = await fetchMe();
        // ล็อกอินสำเร็จ
        if (user.role === 'admin') {
          navigate('/dashboard');
        } else {
          navigate('/daily-record');
        }
      } catch (err) {
        console.error('ไม่สามารถตรวจสอบสิทธิ์ได้:', err);
        setError('ไม่สามารถเข้าสู่ระบบได้ (ไม่พบข้อมูลพนักงานในระบบ)');
        await supabase.auth.signOut();
        setLoading(false);
      }
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  const [isSignUp, setIsSignUp] = useState(false);

  return (
    <div className="relative z-0 min-h-screen flex items-center justify-center bg-slate-50 p-4 overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 w-full max-w-4xl h-[600px] bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden">
        
        {/* Form Container */}
        <div className={`absolute top-0 left-0 w-full md:w-1/2 h-full transition-transform transform-gpu duration-[600ms] ease-in-out z-10 ${isSignUp ? '-translate-x-full md:translate-x-full' : 'translate-x-0'}`}>
          
          {/* Sign Up Form */}
          <div className={`absolute inset-0 p-8 md:p-12 flex flex-col justify-center transition-all duration-[600ms] ${isSignUp ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            <div className="mb-8 text-center">
              <div className="mb-4 flex justify-center">
                <img src="/app_icon_v2.svg" alt="Logo" className="w-16 h-16 rounded-2xl object-contain shadow-md" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Create Account</h2>
              <p className="text-gray-500">Register to HR System</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); alert('Please contact admin to register'); }} className="space-y-4">
               <div>
                 <input type="text" placeholder="Name" required className="w-full bg-gray-50 border border-gray-300 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-400 outline-none transition-all" />
               </div>
               <div>
                 <input type="email" placeholder="Email" required className="w-full bg-gray-50 border border-gray-300 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-400 outline-none transition-all" />
               </div>
               <div>
                 <input type="password" placeholder="Password" required className="w-full bg-gray-50 border border-gray-300 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-400 outline-none transition-all" />
               </div>
               <button type="submit" className="w-full py-3 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all mt-4">Sign Up</button>
            </form>
            <div className="mt-6 text-center md:hidden">
              <button onClick={() => setIsSignUp(false)} className="text-teal-600 font-medium">Already have an account? Sign In</button>
            </div>
          </div>

          {/* Sign In Form */}
          <div className={`absolute inset-0 p-8 md:p-12 flex flex-col justify-center transition-all duration-[600ms] ${isSignUp ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
            <div className="mb-8 text-center">
              <div className="mb-4 flex justify-center">
                <img src="/app_icon_v2.svg" alt="Logo" className="w-16 h-16 rounded-2xl object-contain shadow-md" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Welcome Back</h2>
              <p className="text-gray-500 font-medium">Sign in to your HR Dashboard</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {error && <div className="text-red-500 bg-red-50 p-3 rounded-xl text-center font-medium border border-red-200 text-sm">{error}</div>}
              
              <div>
                <label className="text-sm font-semibold text-gray-600 block mb-1">Username (Email)</label>
                <input type="text" placeholder="admin@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-gray-50 border border-gray-300 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-400 outline-none transition-all font-medium" />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-gray-600 block mb-1">Password</label>
                <input type="password" placeholder="••••••••" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-gray-50 border border-gray-300 text-gray-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-400 outline-none transition-all font-medium" />
              </div>
              
              <div className="pt-2">
                <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all disabled:opacity-50">
                  {loading ? 'กำลังเข้าสู่ระบบ...' : 'Sign In'}
                </button>
              </div>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gray-300"></div>
              <span className="text-sm text-gray-400 font-medium">or</span>
              <div className="flex-1 h-px bg-gray-300"></div>
            </div>

            {/* Google Sign-In Button */}
            <button
              type="button"
              onClick={async () => {
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: window.location.origin + '/dashboard'
                  }
                });
                if (error) setError(error.message);
              }}
              className="w-full flex items-center justify-center gap-3 py-3 bg-white border border-gray-300 rounded-xl shadow-sm hover:shadow-md hover:bg-gray-50 transform hover:-translate-y-0.5 transition-all font-semibold text-gray-700"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>
            
            <div className="mt-6 flex justify-between text-sm font-medium">
              <button onClick={() => setIsSignUp(true)} className="text-teal-600 hover:underline transition-colors block md:hidden">Create Account</button>
              <a href="#" className="text-gray-500 hover:text-gray-800 hover:underline transition-colors w-full text-right md:w-auto">Forgot Password?</a>
            </div>
          </div>
        </div>

        {/* Overlay Panel (Sliding Image) */}
        <div className={`absolute top-0 left-1/2 w-1/2 h-full overflow-hidden text-white bg-[url('/login-bg.png')] bg-contain bg-no-repeat bg-center transition-transform transform-gpu duration-[600ms] ease-in-out z-50 hidden md:block ${isSignUp ? '-translate-x-full' : 'translate-x-0'}`}>
          <div className="absolute inset-0 bg-slate-900/40 mix-blend-multiply"></div>
          
          {/* Left Overlay (Shown when isSignUp is true) */}
          <div className={`absolute inset-0 flex flex-col justify-center items-center p-12 text-center transition-all transform-gpu duration-[600ms] ease-in-out ${isSignUp ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-[20%]'} ${isSignUp ? 'pointer-events-auto' : 'pointer-events-none'}`}>
             <h2 className="text-4xl font-bold mb-4 drop-shadow-md">Already have an account?</h2>
             <p className="mb-8 text-lg drop-shadow-md">Sign in to access your HR dashboard</p>
             <button onClick={() => setIsSignUp(false)} className="relative z-20 pointer-events-auto px-10 py-3 border-2 border-white rounded-full font-bold hover:bg-white hover:text-teal-700 transition-colors shadow-lg">Sign In</button>
          </div>

          {/* Right Overlay (Shown when isSignUp is false) */}
          <div className={`absolute inset-0 flex flex-col justify-center items-center p-12 text-center transition-all transform-gpu duration-[600ms] ease-in-out ${isSignUp ? 'opacity-0 translate-x-[20%]' : 'opacity-100 translate-x-0'} ${isSignUp ? 'pointer-events-none' : 'pointer-events-auto'}`}>
             <h2 className="text-4xl font-bold mb-4 drop-shadow-md">Hello, Friend!</h2>
             <p className="mb-8 text-lg drop-shadow-md">Enter your personal details and start your journey with us.</p>
             <button onClick={() => setIsSignUp(true)} className="relative z-20 pointer-events-auto px-10 py-3 border-2 border-white rounded-full font-bold hover:bg-white hover:text-teal-700 transition-colors shadow-lg">Sign Up</button>
          </div>
        </div>
      </div>
      
      <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-gray-400 absolute bottom-4 w-full z-20">
        <Link to="/privacy-policy" className="hover:text-teal-500 transition-colors">Privacy Policy</Link>
        <span>•</span>
        <Link to="/terms-of-service" className="hover:text-teal-500 transition-colors">Terms of Service</Link>
        <span>•</span>
        <Link to="/data-collection" className="hover:text-teal-500 transition-colors">Data Collection</Link>
        <span>•</span>
        <Link to="/data-deletion" className="hover:text-teal-500 transition-colors">Data Deletion</Link>
      </div>
    </div>
  );
}
