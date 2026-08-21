
import { Link } from 'react-router-dom';

export default function DataCollection() {
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
        <h1 className="text-4xl font-bold mb-4 text-slate-800">Data Collection Policy / นโยบายการเก็บรวบรวมข้อมูล</h1>
        <p className="text-sm text-gray-500 mb-8">อัปเดตล่าสุด: 6 สิงหาคม 2569</p>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">ประเภทข้อมูลที่เก็บ</h2>
          <div className="text-gray-600 leading-relaxed ml-4">
            <ul className="list-disc mb-2 pl-4">
              <li className="mb-2"><strong>ข้อมูลส่วนบุคคล:</strong> ชื่อ นามสกุล รูปโปรไฟล์ ที่อยู่อีเมล เบอร์โทรศัพท์</li>
              <li className="mb-2"><strong>ข้อมูลการเข้างาน:</strong> เวลาเข้าและออกงาน สถานที่ที่ทำการบันทึกเวลา</li>
              <li className="mb-2"><strong>ข้อมูลการใช้งานระบบ:</strong> ประวัติการใช้งาน การดำเนินการต่างๆ ภายในระบบ</li>
            </ul>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">วิธีการเก็บรวบรวม</h2>
          <p className="text-gray-600 leading-relaxed">
            เราเก็บรวบรวมข้อมูลผ่านการป้อนข้อมูลโดยตรงจากผู้ใช้ และจากการบันทึกอัตโนมัติเมื่อมีการโต้ตอบกับระบบ เช่น การล็อกอินหรือการคลิก
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">ระยะเวลาการเก็บรักษา</h2>
          <p className="text-gray-600 leading-relaxed">
            ข้อมูลส่วนบุคคลจะถูกเก็บรักษาไว้ตราบเท่าที่ท่านยังมีบัญชีผู้ใช้งานอยู่ และจะถูกลบหรือทำให้เป็นข้อมูลที่ไม่สามารถระบุตัวตนได้เมื่อบัญชีถูกยกเลิก
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">ฐานทางกฎหมาย (PDPA)</h2>
          <p className="text-gray-600 leading-relaxed">
            การเก็บรวบรวมและการประมวลผลข้อมูลของเราเป็นไปตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) โดยอาศัยฐานสัญญาและฐานความยินยอม
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">สิทธิ์ของเจ้าของข้อมูล</h2>
          <p className="text-gray-600 leading-relaxed">
            ผู้ใช้มีสิทธิ์ในการเข้าถึง ขอสำเนา โอนย้าย แก้ไข ลบ หรือระงับการประมวลผลข้อมูลส่วนบุคคลตามที่กฎหมายกำหนด
          </p>
        </section>

        <footer className="mt-16 pt-8 border-t flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <Link to="/privacy-policy" className="hover:text-teal-500 transition-colors">Privacy Policy</Link>
          <Link to="/terms-of-service" className="hover:text-teal-500 transition-colors">Terms of Service</Link>
          <Link to="/data-deletion" className="hover:text-teal-500 transition-colors">Data Deletion</Link>
        </footer>
      </main>
    </div>
  );
}
