import React from 'react';
import { Link } from 'react-router-dom';

export default function DataDeletion() {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('คำขอลบข้อมูลของคุณถูกส่งเรียบร้อยแล้ว เราจะดำเนินการภายใน 30 วัน');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-800">
      <header className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/app_icon_v2.svg" alt="Logo" className="w-12 h-12 rounded-xl object-contain shadow-xs" />
          <span className="font-bold text-xl text-teal-600">TaskManagementSystem</span>
        </div>
        <Link to="/login" className="text-sm font-medium text-slate-500 hover:text-emerald-500 transition-colors">
          กลับสู่หน้าเข้าสู่ระบบ
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-4 text-slate-800">Data Deletion Request / คำขอลบข้อมูลส่วนบุคคล</h1>
        <p className="text-sm text-gray-500 mb-8">อัปเดตล่าสุด: 6 สิงหาคม 2569</p>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">สิทธิ์ในการลบข้อมูล</h2>
          <p className="text-gray-600 leading-relaxed">
            ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล คุณมีสิทธิ์ที่จะขอให้เราทำการลบหรือทำลายข้อมูลส่วนบุคคลของคุณในระบบของเรา โปรดกรอกแบบฟอร์มด้านล่างเพื่อยืนยันคำขอของคุณ
          </p>
        </section>

        <section className="mb-12 bg-white p-8 rounded-xl border shadow-sm">
          <h2 className="text-xl font-bold mb-6 text-slate-800">แบบฟอร์มคำขอลบข้อมูล</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">อีเมลที่ใช้ลงทะเบียน</label>
              <input 
                type="email" 
                id="email" 
                required
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-shadow"
                placeholder="you@example.com"
              />
            </div>
            
            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">เหตุผลในการขอลบข้อมูล</label>
              <textarea 
                id="reason" 
                rows={4}
                required
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-shadow resize-none"
                placeholder="โปรดระบุเหตุผลในการขอลบข้อมูลของคุณ..."
              ></textarea>
            </div>

            <button 
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              ส่งคำขอลบข้อมูล
            </button>

            <p className="text-xs text-center text-gray-500 mt-4">
              *หมายเหตุ: คำขอลบข้อมูลของคุณจะได้รับการดำเนินการภายใน 30 วันนับจากวันที่ได้รับคำขอ
            </p>
          </form>
        </section>

        <footer className="mt-16 pt-8 border-t flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <Link to="/privacy-policy" className="hover:text-teal-500 transition-colors">Privacy Policy</Link>
          <Link to="/terms-of-service" className="hover:text-teal-500 transition-colors">Terms of Service</Link>
          <Link to="/data-collection" className="hover:text-teal-500 transition-colors">Data Collection</Link>
        </footer>
      </main>
    </div>
  );
}
