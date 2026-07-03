import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchMe } from '../services/adminApi';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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

      // เช็คว่าเป็น admin หรือไม่
      try {
        const user = await fetchMe();
        if (user.role !== 'admin') {
          setError('คุณไม่มีสิทธิ์เข้าถึงหน้า Admin กรุณาใช้แอปพนักงาน');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
        // ล็อกอินสำเร็จและเป็น Admin
        navigate('/dashboard');
      } catch (err) {
        console.error('ไม่สามารถตรวจสอบสิทธิ์ได้:', err);
        setError('ไม่สามารถเข้าสู่ระบบได้ (ไม่พบข้อมูลพนักงานในระบบ หรือคุณไม่มีสิทธิ์ของแอดมิน)');
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
    <div id="login-section" style={{ display: 'flex' }}>
      <div className="login-left">
        <div className="brand-logo">
          <i className="fa-solid fa-shapes"></i> NexHR System
        </div>
        <div className="login-header">
          <h1>
            Sign in to Your
            <br />
            HR Dashboard
          </h1>
          <p>Manage employees, track attendance, and more.</p>
        </div>
        <form onSubmit={handleLogin}>
          {error && <div style={{ color: 'var(--red)', marginBottom: '15px', fontWeight: 500 }}>{error}</div>}
          <div className="input-group">
            <label className="input-label">Username (Email)</label>
            <input
              type="text"
              className="login-input"
              placeholder="admin@company.com"
              id="login-email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              type="password"
              className="login-input"
              placeholder="••••••••"
              id="login-pass"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-signin" disabled={loading}>
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'Sign in'}
          </button>
        </form>
      </div>
      <div className="login-right">
        <img
          src="https://images.unsplash.com/photo-1551434678-e076c223a692?q=80&w=1000&auto=format&fit=crop"
          className="hero-img"
          alt="Hero"
        />
      </div>
    </div>
  );
}
