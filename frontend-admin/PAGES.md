# 📄 โครงสร้างและรายละเอียดหน้าต่างๆ ของระบบ Web Admin (frontend-admin)

สรุปรายละเอียดหน้าจอต่างๆ ในโฟลเดอร์ `frontend-admin/src/pages` เพื่อให้สามารถนำหน้าเหล่านั้นมาประยุกต์ใช้งานและสร้างทางลัด (Shortcuts) บนหน้าแรก (Dashboard) ได้ตามต้องการ

---

## 📂 รายการหน้าเว็บระบบ Admin (Vite + React)

ระบบมีทั้งหมด **7 หน้าหลัก** ดังต่อไปนี้:

1. **Dashboard (`Dashboard.tsx`)**:
   * **บทบาท**: หน้าแรกสรุปภาพรวมทั้งหมดประจำวันแบบ Real-time
   * **ข้อมูลที่แสดง**: ยอดพนักงานทั้งหมด, จำนวนคนเข้างานปกติ, มาสาย, ขาดงาน, สถิติการลาแต่ละประเภท (ป่วย/กิจ/พักร้อน) และประวัติเข้างานรายบุคคล
2. **จัดการคำขอ (`Requests.tsx`)**:
   * **บทบาท**: หน้ากล่องจดหมายเข้า (Inbox) รอดำเนินการจากพนักงาน
   * **ข้อมูลที่แสดง**: คำขอลา (Leave Requests) และขอออกนอกสถานที่ (Offsite Requests) รอให้แอดมินกด **"อนุมัติ"** หรือ **"ปฏิเสธ"**
3. **จัดการพนักงาน (`Employees.tsx`)**:
   * **บทบาท**: หน้าจัดการโปรไฟล์และสิทธิ์ของพนักงานทั้งหมด
   * **ฟังก์ชัน**: อนุมัติบัญชีสมัครใหม่ (`approve`), ปิดใช้งานบัญชี (`disable`), เปลี่ยนสิทธิ์ (`role`), แก้ไขข้อมูล และ **ปลดล็อคเครื่องมือถือ (Unbind Device)**
4. **จัดการวันหยุด (`Holidays.tsx`)**:
   * **บทบาท**: ระบบสำหรับป้อนวันหยุดนักขัตฤกษ์หรือวันหยุดบริษัท
5. **บันทึกเวลารายวัน (`DailyRecord.tsx`)**:
   * **บทบาท**: แสดงตารางการลงเวลาเข้า-ออกงานอย่างละเอียดรายคนในแต่ละวัน
   * **ข้อมูลพิเศษ**: พิกัดแผนที่ GPS ที่พนักงานเช็คอิน/เช็คเอาท์ เทียบกับจุด Geofence
6. **รายงานประวัติเข้างาน (`History.tsx`)**:
   * **บทบาท**: รายงานประวัติเข้างานเชิงสถิติรายบุคคลและรายเดือนเพื่อใช้ทำเงินเดือน
7. **เข้าสู่ระบบ (`Login.tsx`)**:
   * **บทบาท**: หน้าล็อกอินผ่าน Supabase Auth สำหรับผู้ดูแลระบบ

---

## ⚡ วิธีการเพิ่ม "ปุ่มทางลัดด่วน (Quick Shortcut Cards)" ในหน้าแรก

เพื่อเพิ่ม **ปุ่มทางลัด (Shortcuts)** เช่น **"มอบหมายงาน"**, **"งานที่ต้องทำ"**, หรือ **"คำขอรอดำเนินการ"** บนหน้าหลักของเว็บ เพื่อให้คลิกเดียวเข้าถึงหน้าต่างๆ ได้อย่างสะดวก:

### โค้ดตัวอย่างที่สามารถนำไปวางใน `Dashboard.tsx`:

วางส่วนการแสดงผลนี้ใต้ Banner ต้อนรับ หรือในส่วนบนของหน้าจอ (`Dashboard.tsx` ด้านในแถบแสดงผลหลัก):

```tsx
{/* ⚡ Quick Shortcuts Section */}
<div style={{
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '15px',
  marginBottom: '25px'
}}>
  {/* ปุ่มทางลัด: คำขอรอดำเนินการ */}
  <a href="/requests" className="shortcut-card" style={{
    display: 'flex',
    alignItems: 'center',
    padding: '16px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    textDecoration: 'none',
    color: 'inherit',
    border: '1px solid var(--border-color)',
    transition: 'transform 0.2s'
  }}
  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
  onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
  >
    <div style={{ background: '#EFF6FF', padding: '10px', borderRadius: '8px', marginRight: '12px' }}>
      <i className="fa-solid fa-envelope-open-text" style={{ color: 'var(--primary)', fontSize: '20px' }}></i>
    </div>
    <div>
      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>งานรอดำเนินการ</h4>
      <span style={{ fontSize: '12px', color: 'var(--text-gray)' }}>อนุมัติใบลา/ออกหน้างาน</span>
    </div>
  </a>

  {/* ปุ่มทางลัด: มอบหมายงาน */}
  <a href="/employees" className="shortcut-card" style={{
    display: 'flex',
    alignItems: 'center',
    padding: '16px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    textDecoration: 'none',
    color: 'inherit',
    border: '1px solid var(--border-color)',
    transition: 'transform 0.2s'
  }}
  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
  onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
  >
    <div style={{ background: '#F0FDF4', padding: '10px', borderRadius: '8px', marginRight: '12px' }}>
      <i className="fa-solid fa-list-check" style={{ color: '#16a34a', fontSize: '20px' }}></i>
    </div>
    <div>
      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>มอบหมายงาน / หน้าที่</h4>
      <span style={{ fontSize: '12px', color: 'var(--text-gray)' }}>กำหนดภารกิจพนักงาน</span>
    </div>
  </a>

  {/* ปุ่มทางลัด: รายงานสถิติเข้างาน */}
  <a href="/daily-record" className="shortcut-card" style={{
    display: 'flex',
    alignItems: 'center',
    padding: '16px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    textDecoration: 'none',
    color: 'inherit',
    border: '1px solid var(--border-color)',
    transition: 'transform 0.2s'
  }}
  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
  onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
  >
    <div style={{ background: '#FFFBEB', padding: '10px', borderRadius: '8px', marginRight: '12px' }}>
      <i className="fa-solid fa-map-location-dot" style={{ color: '#d97706', fontSize: '20px' }}></i>
    </div>
    <div>
      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>พิกัดทำงานวันนี้</h4>
      <span style={{ fontSize: '12px', color: 'var(--text-gray)' }}>ตรวจสอบพิกัดลงเวลาจริง</span>
    </div>
  </a>
</div>
```
