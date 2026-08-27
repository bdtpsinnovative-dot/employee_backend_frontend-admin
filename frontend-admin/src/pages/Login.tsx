import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchMe } from '../services/adminApi';
import { useTheme } from '../theme/ThemeProvider';
import AnimatedBackground from '../components/AnimatedBackground';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();
  const { resolvedTheme, toggleTheme } = useTheme();

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

  return (
    <div className="relative z-0 min-h-screen flex items-center justify-center bg-slate-100 dark:bg-[#070b14] p-4 overflow-hidden transition-colors duration-300">
      <AnimatedBackground />

      {/* Floating Theme Switcher */}
      <div className="fixed top-5 right-5 z-30">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/80 dark:bg-slate-850/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 shadow-md hover:shadow-lg transition-all cursor-pointer text-xs font-bold hover:scale-105 active:scale-95"
          title={`เปลี่ยนเป็นโหมด${resolvedTheme === 'dark' ? 'สว่าง' : 'มืด'}`}
        >
          {resolvedTheme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span>โหมดสว่าง</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-500" />
              <span>โหมดมืด</span>
            </>
          )}
        </button>
      </div>

      {/* Main Glass Card Container */}
      <div className="relative z-10 w-full max-w-4xl h-[620px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-3xl border border-slate-200/90 dark:border-slate-800/90 shadow-2xl dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden transition-colors duration-300">
        
        {/* Form Container */}
        <div className={`absolute top-0 left-0 w-full md:w-1/2 h-full transition-transform transform-gpu duration-[600ms] ease-in-out z-10 ${isSignUp ? '-translate-x-full md:translate-x-full' : 'translate-x-0'}`}>
          
          {/* Sign Up Form */}
          <div className={`absolute inset-0 p-8 md:p-10 flex flex-col justify-center transition-all duration-[600ms] ${isSignUp ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            <div className="mb-6 text-center">
              <div className="mb-3 flex justify-center">
                <img src="/app_icon_v2.svg" alt="Logo" className="w-14 h-14 rounded-2xl object-contain shadow-lg shadow-teal-500/10 border border-slate-100 dark:border-slate-800" />
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-1">Create Account</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Register to HR Management System</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); alert('กรุณาติดต่อผู้ดูแลระบบเพื่อสร้างบัญชีผู้ใช้'); }} className="space-y-3.5">
               <div>
                 <input type="text" placeholder="ชื่อ-นามสกุล" required className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500" />
               </div>
               <div>
                 <input type="email" placeholder="อีเมล (Email)" required className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500" />
               </div>
               <div>
                 <input type="password" placeholder="รหัสผ่าน (Password)" required className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500" />
               </div>
               <button type="submit" className="w-full py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 transform hover:-translate-y-0.5 active:translate-y-0 transition-all text-sm mt-2 cursor-pointer">ลงทะเบียน</button>
            </form>
            <div className="mt-4 text-center md:hidden">
              <button onClick={() => setIsSignUp(false)} className="text-teal-600 dark:text-teal-400 font-semibold text-xs hover:underline cursor-pointer">มีบัญชีอยู่แล้ว? เข้าสู่ระบบ</button>
            </div>
          </div>

          {/* Sign In Form */}
          <div className={`absolute inset-0 p-8 md:p-10 flex flex-col justify-center transition-all duration-[600ms] ${isSignUp ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
            <div className="mb-6 text-center">
              <div className="mb-3 flex justify-center">
                <img src="/app_icon_v2.svg" alt="Logo" className="w-14 h-14 rounded-2xl object-contain shadow-lg shadow-teal-500/10 border border-slate-100 dark:border-slate-800" />
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-1">Welcome Back</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">เข้าสู่ระบบจัดการบุคลากร (HR Dashboard)</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-3.5">
              {error && (
                <div className="text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl text-center font-medium border border-rose-200 dark:border-rose-800/60 text-xs">
                  {error}
                </div>
              )}
              
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block mb-1">Username (Email)</label>
                <input
                  type="text"
                  placeholder="admin@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium"
                />
              </div>
              
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block mb-1">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium"
                />
              </div>
              
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-teal-500/25 hover:shadow-teal-500/35 transform hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 text-sm cursor-pointer"
                >
                  {loading ? 'กำลังเข้าสู่ระบบ...' : 'Sign In'}
                </button>
              </div>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase">or</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
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
              className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-white hover:bg-slate-50 dark:bg-slate-800/90 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs text-slate-700 dark:text-slate-200 font-bold text-xs transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Sign in with Google</span>
            </button>
            
            <div className="mt-4 flex justify-between text-xs font-semibold">
              <button onClick={() => setIsSignUp(true)} className="text-teal-600 dark:text-teal-400 hover:underline transition-colors block md:hidden cursor-pointer">สร้างบัญชีผู้ใช้</button>
              <a href="#" className="text-slate-400 dark:text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 hover:underline transition-colors w-full text-right md:w-auto">ลืมรหัสผ่าน?</a>
            </div>
          </div>
        </div>

        {/* Overlay Panel (Sliding Image / Mascot) */}
        <div className={`absolute top-0 left-1/2 w-1/2 h-full overflow-hidden bg-gradient-to-br from-indigo-50/80 via-sky-50/60 to-emerald-50/80 dark:from-slate-850 dark:via-slate-900 dark:to-slate-950 border-l border-slate-200/60 dark:border-slate-800/80 transition-transform transform-gpu duration-[600ms] ease-in-out z-50 hidden md:block ${isSignUp ? '-translate-x-full' : 'translate-x-0'}`}>
          
          {/* Left Overlay (Shown when isSignUp is true) */}
          <div className={`absolute inset-0 flex flex-col justify-between items-center p-8 text-center transition-all transform-gpu duration-[600ms] ease-in-out ${isSignUp ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-[20%]'} ${isSignUp ? 'pointer-events-auto' : 'pointer-events-none'}`}>
            <div className="pt-2">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-1">Already have an account?</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xs mx-auto">เข้าสู่ระบบเพื่อจัดการงานและดูภาพรวม HR Dashboard</p>
            </div>

            <div className="my-auto py-2 flex items-center justify-center">
              <img
                src="/login-bg.png"
                alt="HR Illustration"
                className="max-h-[280px] w-auto object-contain drop-shadow-xl select-none pointer-events-none transition-transform duration-300 hover:scale-105"
              />
            </div>

            <div className="pb-2 w-full flex justify-center">
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className="px-8 py-2.5 border-2 border-teal-500 dark:border-teal-400 text-teal-600 dark:text-teal-400 hover:bg-teal-500 hover:text-white dark:hover:bg-teal-400 dark:hover:text-slate-900 rounded-full font-bold text-xs uppercase tracking-wider transition-all shadow-sm hover:shadow-md cursor-pointer active:scale-95"
              >
                Sign In
              </button>
            </div>
          </div>

          {/* Right Overlay (Shown when isSignUp is false) */}
          <div className={`absolute inset-0 flex flex-col justify-between items-center p-8 text-center transition-all transform-gpu duration-[600ms] ease-in-out ${isSignUp ? 'opacity-0 translate-x-[20%]' : 'opacity-100 translate-x-0'} ${isSignUp ? 'pointer-events-none' : 'pointer-events-auto'}`}>
            <div className="pt-2">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-1">Hello, Friend!</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xs mx-auto">เริ่มต้นการทำงานอย่างมีประสิทธิภาพไปพร้อมกับเรา</p>
            </div>

            <div className="my-auto py-2 flex items-center justify-center">
              <img
                src="/login-bg.png"
                alt="HR Illustration"
                className="max-h-[280px] w-auto object-contain drop-shadow-xl select-none pointer-events-none transition-transform duration-300 hover:scale-105"
              />
            </div>

            <div className="pb-2 w-full flex justify-center">
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                className="px-8 py-2.5 border-2 border-teal-500 dark:border-teal-400 text-teal-600 dark:text-teal-400 hover:bg-teal-500 hover:text-white dark:hover:bg-teal-400 dark:hover:text-slate-900 rounded-full font-bold text-xs uppercase tracking-wider transition-all shadow-sm hover:shadow-md cursor-pointer active:scale-95"
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Legal Links */}
      <div className="flex flex-wrap justify-center gap-4 text-[11px] text-slate-400 dark:text-slate-500 absolute bottom-4 w-full z-20">
        <Link to="/privacy-policy" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">Privacy Policy</Link>
        <span>•</span>
        <Link to="/terms-of-service" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">Terms of Service</Link>
        <span>•</span>
        <Link to="/data-collection" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">Data Collection</Link>
        <span>•</span>
        <Link to="/data-deletion" className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors">Data Deletion</Link>
      </div>
    </div>
  );
}
