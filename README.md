# employee

## Database Save Points

ระบบ Backup สร้างจุดเซฟเฉพาะฐานข้อมูล ไม่สำรองและไม่กู้คืนรูปหรือไฟล์ใน R2 โดย Production เก็บ database dump และ table manifest ใน R2 bucket เดิมใต้ prefix `backups/` แยกจากรูป จึงไม่ต้องสร้าง bucket รูปสำรองใหม่

ตั้งค่า environment ของ Backend ดังนี้:

```env
# Production: สร้างจุดเซฟได้ และเปิด Restore เฉพาะเมื่อระบุเป้าหมายชัดเจน
APP_ENV=production
BACKUP_RESTORE_ENABLED=true
BACKUP_RESTORE_TARGET=production
BACKUP_STORAGE=r2

# Local/Dev: สร้างจุดเซฟได้ แต่ Restore เปิดเฉพาะเมื่อ DATABASE_URL ชี้ PostgreSQL Local
APP_ENV=development
BACKUP_RESTORE_ENABLED=true
BACKUP_RESTORE_TARGET=local
BACKUP_LOCAL_DIR=.data/backups/restore-test
```

ทั้ง Development และ Production สร้างจุดเซฟได้ตามปกติ โดย Restore จะเปิดก็ต่อเมื่อ `BACKUP_RESTORE_ENABLED=true` และตั้ง `BACKUP_RESTORE_TARGET` ให้ตรงกับสภาพแวดล้อม (`local` หรือ `production`) จุดเซฟของแต่ละสภาพแวดล้อมต้องใช้พื้นที่เก็บแยกกัน ห้ามใช้จุดเซฟทดสอบร่วมกับ DB จริง

ตัวอย่างโฟลเดอร์ที่แนะนำ:

```env
# Local Restore database
BACKUP_LOCAL_DIR=.data/backups/restore-test

# Dev ที่ต่อฐานข้อมูลจริงเพื่อสร้างจุดเซฟแยกชุด
BACKUP_LOCAL_DIR=.data/backups/real-db

# Production
BACKUP_STORAGE=r2
```

เครื่องพัฒนานี้มีฐานทดสอบ Restore ที่ `127.0.0.1:5433/employee_restore_test` ใช้ PostgreSQL 18 และเก็บ data directory ไว้ใต้ `backend/.data/postgres-restore`:

```sh
cd backend
./scripts/start_restore_db.sh  # เปิดเฉพาะ PostgreSQL Local
./scripts/run_restore_local.sh # เปิด PostgreSQL Local และ Backend ในโหมด Restore
./scripts/stop_restore_db.sh   # ปิด PostgreSQL Local
```
