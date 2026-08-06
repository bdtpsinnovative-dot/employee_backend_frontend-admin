
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
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
        <h1 className="text-4xl font-bold mb-4 text-slate-800">Privacy Policy / นโยบายความเป็นส่วนตัว</h1>
        <p className="text-sm text-gray-500 mb-8">อัปเดตล่าสุด: 6 สิงหาคม 2569</p>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">ข้อมูลที่เราเก็บรวบรวม</h2>
          <p className="text-gray-600 leading-relaxed">
            เราเก็บรวบรวมข้อมูลส่วนบุคคลที่จำเป็นสำหรับการใช้งานระบบ เช่น ชื่อ นามสกุล ที่อยู่อีเมล เบอร์โทรศัพท์ และข้อมูลเกี่ยวกับการเข้าใช้งานระบบ เพื่อให้การทำงานมีประสิทธิภาพ
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">วัตถุประสงค์ในการใช้ข้อมูล</h2>
          <p className="text-gray-600 leading-relaxed">
            ข้อมูลของคุณจะถูกใช้เพื่อการจัดการระบบ การเข้าถึงบริการ การติดต่อสื่อสาร และการปรับปรุงประสิทธิภาพการทำงานของแพลตฟอร์ม
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">การแบ่งปันข้อมูล</h2>
          <p className="text-gray-600 leading-relaxed">
            เราจะไม่แบ่งปันข้อมูลส่วนบุคคลของคุณให้กับบุคคลภายนอก เว้นแต่จะได้รับความยินยอมจากคุณหรือเป็นไปตามข้อกำหนดทางกฎหมาย
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">ความปลอดภัยของข้อมูล</h2>
          <p className="text-gray-600 leading-relaxed">
            เรามีมาตรการรักษาความปลอดภัยที่เหมาะสมเพื่อป้องกันการเข้าถึง การแก้ไข หรือการเปิดเผยข้อมูลส่วนบุคคลของคุณโดยไม่ได้รับอนุญาต
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">สิทธิ์ของผู้ใช้</h2>
          <p className="text-gray-600 leading-relaxed">
            คุณมีสิทธิ์ในการเข้าถึง แก้ไข ลบ หรือคัดค้านการประมวลผลข้อมูลส่วนบุคคลของคุณตามที่กฎหมายกำหนด
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">การเปลี่ยนแปลงนโยบาย</h2>
          <p className="text-gray-600 leading-relaxed">
            เราอาจมีการปรับปรุงนโยบายความเป็นส่วนตัวนี้เป็นระยะ การเปลี่ยนแปลงใดๆ จะมีการแจ้งให้ทราบผ่านทางแพลตฟอร์มของเรา
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-teal-600">ช่องทางติดต่อ</h2>
          <p className="text-gray-600 leading-relaxed">
            หากมีข้อสงสัยเกี่ยวกับนโยบายความเป็นส่วนตัว กรุณาติดต่อเราทางอีเมล: support@taskmanagementsystem.com
          </p>
        </section>

        <footer className="mt-16 pt-8 border-t flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <Link to="/terms-of-service" className="hover:text-teal-500 transition-colors">Terms of Service</Link>
          <Link to="/data-collection" className="hover:text-teal-500 transition-colors">Data Collection</Link>
          <Link to="/data-deletion" className="hover:text-teal-500 transition-colors">Data Deletion</Link>
        </footer>
      </main>
    </div>
  );
}
