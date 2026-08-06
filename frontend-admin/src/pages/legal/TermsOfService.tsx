
import { Link } from 'react-router-dom';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-800">
      <header className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/favicon.png" alt="Logo" className="w-12 h-12 rounded-xl" />
          <span className="font-bold text-xl text-teal-600">TaskManagementSystem</span>
        </div>
        <Link to="/login" className="text-sm font-medium text-slate-500 hover:text-emerald-500 transition-colors">
          กลับสู่หน้าเข้าสู่ระบบ
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-4 text-slate-800">Terms of Service / ข้อกำหนดการใช้งาน</h1>
        <p className="text-sm text-gray-500 mb-8">อัปเดตล่าสุด: 6 สิงหาคม 2569</p>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">เงื่อนไขทั่วไป</h2>
          <p className="text-gray-600 leading-relaxed">
            การเข้าถึงและใช้งานระบบนี้ ถือว่าท่านยอมรับข้อกำหนดและเงื่อนไขทั้งหมดที่ระบุไว้ในหน้านี้
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">การใช้บริการ</h2>
          <p className="text-gray-600 leading-relaxed">
            ผู้ใช้ต้องใช้งานระบบในทางที่ถูกต้องและไม่ละเมิดสิทธิ์ของผู้อื่น ห้ามใช้ระบบเพื่อกระทำการใดๆ ที่ผิดกฎหมายหรือขัดต่อศีลธรรมอันดี
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">บัญชีผู้ใช้</h2>
          <p className="text-gray-600 leading-relaxed">
            ท่านต้องรักษาข้อมูลการเข้าสู่ระบบของท่านไว้เป็นความลับ และรับผิดชอบต่อกิจกรรมทั้งหมดที่เกิดขึ้นภายใต้บัญชีของท่าน
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">ข้อจำกัดความรับผิดชอบ</h2>
          <p className="text-gray-600 leading-relaxed">
            เราจะไม่รับผิดชอบต่อความเสียหายใดๆ ที่เกิดขึ้นจากการใช้งานระบบ รวมถึงการสูญหายของข้อมูล หรือข้อผิดพลาดที่เกิดจากเหตุสุดวิสัย
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">ทรัพย์สินทางปัญญา</h2>
          <p className="text-gray-600 leading-relaxed">
            เนื้อหา ข้อมูล และซอฟต์แวร์ทั้งหมดในระบบนี้ เป็นทรัพย์สินทางปัญญาของเรา และได้รับความคุ้มครองตามกฎหมาย
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">การระงับบริการ</h2>
          <p className="text-gray-600 leading-relaxed">
            เราขอสงวนสิทธิ์ในการระงับหรือยกเลิกการเข้าถึงบริการของท่าน หากพบว่ามีการละเมิดข้อกำหนดการใช้งาน
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">กฎหมายที่ใช้บังคับ</h2>
          <p className="text-gray-600 leading-relaxed">
            ข้อกำหนดการใช้งานนี้อยู่ภายใต้การบังคับใช้และตีความตามกฎหมายของประเทศไทย
          </p>
        </section>

        <footer className="mt-16 pt-8 border-t flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <Link to="/privacy-policy" className="hover:text-teal-500 transition-colors">Privacy Policy</Link>
          <Link to="/data-collection" className="hover:text-teal-500 transition-colors">Data Collection</Link>
          <Link to="/data-deletion" className="hover:text-teal-500 transition-colors">Data Deletion</Link>
        </footer>
      </main>
    </div>
  );
}
