import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Smartphone,
  Download,
  CheckCircle2,
  QrCode,
  Laptop,
  Apple,
  ShieldCheck,
  Bell,
  MapPin,
  Sparkles,
  Copy,
  Check,
  Clock,
  HardDrive
} from 'lucide-react';

export default function AppDownload() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'windows' | 'mac'>('android');
  const [downloadingPlatform, setDownloadingPlatform] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState<string | null>(null);

  const handleDownload = (platformName: string, fileName: string) => {
    setDownloadingPlatform(platformName);
    setDownloadProgress(20);

    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setDownloadingPlatform(null), 2000);
          return 100;
        }
        return prev + 25;
      });
    }, 250);

    const blob = new Blob([`HR Studio App Installer (${platformName} - v2.4.0)`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      {/* Top Breadcrumb & Back Action */}
      <div className="max-w-6xl mx-auto mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800 transition-all shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>กลับสู่หน้าแดชบอร์ด</span>
        </button>

        <button
          type="button"
          onClick={handleCopyShareLink}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="คัดลอกลิงก์หน้านี้"
        >
          {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedLink ? 'คัดลอกลิงก์แล้ว' : 'แชร์ลิงก์ดาวน์โหลด'}</span>
        </button>
      </div>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto mb-10 sm:mb-14">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white p-8 sm:p-12 shadow-xl shadow-blue-500/10">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-bold text-white mb-4">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>เวอร์ชันล่าสุด 2.4.0 (อัปเดตใหม่)</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight font-['Prompt'] leading-tight mb-3">
              ศูนย์ดาวน์โหลดแอปพลิเคชัน <br className="hidden sm:inline" />
              HR Studio & Mobile Portal
            </h1>

            <p className="text-sm sm:text-base text-blue-100 font-light leading-relaxed mb-6">
              สะดวก รวดเร็ว เช็คอินและลงเวลาทำงานได้ทุกที่ อนุมัติคำขอ จัดการงาน และรับการแจ้งเตือนทันทีผ่านสมาร์ตโฟนและคอมพิวเตอร์ของคุณ
            </p>

            <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-blue-100">
              <span className="flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-lg backdrop-blur-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                GPS Check-in
              </span>
              <span className="flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-lg backdrop-blur-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Real-time Alerts
              </span>
              <span className="flex items-center gap-1.5 bg-black/20 px-3 py-1 rounded-lg backdrop-blur-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                iOS, Android & Windows
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Download Progress Toast */}
      {downloadingPlatform && (
        <div className="max-w-6xl mx-auto mb-6">
          <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 shadow-lg flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center animate-bounce">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold font-['Prompt']">
                  {downloadProgress >= 100
                    ? `ดาวน์โหลดไฟล์ติดตั้ง ${downloadingPlatform} เรียบร้อยแล้ว!`
                    : `กำลังเตรียมและดาวน์โหลด ${downloadingPlatform}...`}
                </p>
                <div className="w-48 sm:w-64 bg-blue-200 dark:bg-blue-900 h-2 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              </div>
            </div>
            <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 font-mono">
              {downloadProgress}%
            </span>
          </div>
        </div>
      )}

      {/* Main Download Cards Grid */}
      <div className="max-w-6xl mx-auto mb-14">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight font-['Prompt'] text-slate-900 dark:text-slate-100">
              เลือกระบบปฏิบัติการของคุณ
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              รองรับทั้งสมาร์ตโฟน แท็บเล็ต และคอมพิวเตอร์ตั้งโต๊ะ
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* 1. Android Card */}
          <div className="flex flex-col justify-between rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
            <div>
              <div className="flex items-start justify-between mb-4">
                <div className="w-13 h-13 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
                  <Smartphone className="w-7 h-7" />
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300">
                  Android APK
                </span>
              </div>

              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 font-['Prompt'] mb-1">
                Android สมาร์ตโฟน
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                ไฟล์ติดตั้ง APK โดยตรง รองรับทุกรุ่น ทุกยี่ห้อ (Android 8.0 ขึ้นไป)
              </p>

              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 mb-6 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <div className="flex justify-between">
                  <span className="text-slate-400">เวอร์ชัน:</span>
                  <span className="font-semibold">v2.4.0 (Build 142)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ขนาดไฟล์:</span>
                  <span className="font-semibold">28.4 MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">รองรับ:</span>
                  <span className="font-semibold">Samsung, Xiaomi, Oppo ฯลฯ</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => handleDownload('Android APK', 'HR-Studio-v2.4.0.apk')}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>ดาวน์โหลด APK ทันที</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQrModal('android')}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>สแกน QR บนมือถือ</span>
              </button>
            </div>
          </div>

          {/* 2. iOS / Apple Card */}
          <div className="flex flex-col justify-between rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
            <div>
              <div className="flex items-start justify-between mb-4">
                <div className="w-13 h-13 rounded-2xl bg-sky-50 dark:bg-sky-950/60 border border-sky-100 dark:border-sky-900/50 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-xs">
                  <Apple className="w-7 h-7" />
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300">
                  iOS Web App / PWA
                </span>
              </div>

              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 font-['Prompt'] mb-1">
                iPhone & iPad (iOS)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                ติดตั้งง่ายผ่าน Safari ได้ทันทีโดยไม่ต้องผ่าน App Store
              </p>

              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 mb-6 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <div className="flex justify-between">
                  <span className="text-slate-400">เวอร์ชัน:</span>
                  <span className="font-semibold">v2.4.0 (PWA Ready)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ขนาดไฟล์:</span>
                  <span className="font-semibold">Instant Cache (4.2 MB)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">รองรับ:</span>
                  <span className="font-semibold">iOS 14.0 ขึ้นไป</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                <span>วิธีติดตั้งบน iPhone</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQrModal('ios')}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>สแกนเปิดด้วย Safari</span>
              </button>
            </div>
          </div>

          {/* 3. Windows PC Card */}
          <div className="flex flex-col justify-between rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
            <div>
              <div className="flex items-start justify-between mb-4">
                <div className="w-13 h-13 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
                  <Laptop className="w-7 h-7" />
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300">
                  Windows 64-bit
                </span>
              </div>

              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 font-['Prompt'] mb-1">
                Windows Desktop
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                โปรแกรมตั้งโต๊ะสำหรับ Windows 10/11 แจ้งเตือนใน System Tray ทำงานรวดเร็ว
              </p>

              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 mb-6 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <div className="flex justify-between">
                  <span className="text-slate-400">เวอร์ชัน:</span>
                  <span className="font-semibold">v2.4.0 Setup (.exe)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ขนาดไฟล์:</span>
                  <span className="font-semibold">64.2 MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">รองรับ:</span>
                  <span className="font-semibold">Windows 10, 11 (64-bit)</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => handleDownload('Windows Setup', 'HR-Studio-Setup-v2.4.0.exe')}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>ดาวน์โหลด (.exe)</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownload('Windows Portable', 'HR-Studio-Portable-v2.4.0.zip')}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>แบบ Portable (.zip)</span>
              </button>
            </div>
          </div>

          {/* 4. macOS Card */}
          <div className="flex flex-col justify-between rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
            <div>
              <div className="flex items-start justify-between mb-4">
                <div className="w-13 h-13 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-xs">
                  <Apple className="w-7 h-7" />
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  macOS DMG
                </span>
              </div>

              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 font-['Prompt'] mb-1">
                macOS (MacBook / iMac)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                ติดตั้งบนเครื่อง Mac รองรับทั้ง Apple Silicon (M1/M2/M3) และชิป Intel
              </p>

              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 mb-6 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <div className="flex justify-between">
                  <span className="text-slate-400">เวอร์ชัน:</span>
                  <span className="font-semibold">v2.4.0 Universal (.dmg)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ขนาดไฟล์:</span>
                  <span className="font-semibold">68.5 MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">รองรับ:</span>
                  <span className="font-semibold">macOS 12 Monterey ขึ้นไป</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => handleDownload('macOS DMG', 'HR-Studio-v2.4.0.dmg')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>ดาวน์โหลด (.dmg)</span>
              </button>

              <div className="text-center py-1">
                <span className="text-[11px] text-slate-400">รองรับ Apple Silicon M-Series</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Installation Guide Tabs */}
      <div className="max-w-6xl mx-auto mb-14">
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-200/80 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-bold font-['Prompt'] text-slate-900 dark:text-slate-100">
                คำแนะนำและวิธีติดตั้ง (3 ขั้นตอนง่ายๆ)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                เลือกอุปกรณ์ของคุณเพื่อดูวิธีเปิดใช้งานแอปอย่างถูกต้อง
              </p>
            </div>

            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-fit">
              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'android'
                    ? 'bg-white dark:bg-[#0c1222] text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                Android
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'ios'
                    ? 'bg-white dark:bg-[#0c1222] text-sky-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                iOS (iPhone)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('windows')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'windows'
                    ? 'bg-white dark:bg-[#0c1222] text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                Windows PC
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('mac')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'mac'
                    ? 'bg-white dark:bg-[#0c1222] text-slate-800 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                macOS
              </button>
            </div>
          </div>

          {activeTab === 'android' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <span className="w-7 h-7 rounded-lg bg-emerald-500 text-white font-bold text-xs flex items-center justify-center mb-3">1</span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">ดาวน์โหลดไฟล์ APK</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  กดปุ่มดาวน์โหลด APK บนหน้านี้ หรือใช้กล้องมือถือสแกนคิวอาร์โค้ด
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <span className="w-7 h-7 rounded-lg bg-emerald-500 text-white font-bold text-xs flex items-center justify-center mb-3">2</span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">อนุญาตติดตั้งแอป</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  หากมีข้อความแจ้งเตือนความปลอดภัย ให้เลือก "อนุญาตจากแหล่งที่มานี้" เพื่อดำเนินการต่อ
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <span className="w-7 h-7 rounded-lg bg-emerald-500 text-white font-bold text-xs flex items-center justify-center mb-3">3</span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">เปิดใช้งาน & เข้าสู่ระบบ</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  เปิดแอปแล้วล็อกอินด้วยบัญชีอีเมลพนักงานของคุณ เริ่มบันทึกเวลาได้ทันที
                </p>
              </div>
            </div>
          )}

          {activeTab === 'ios' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <span className="w-7 h-7 rounded-lg bg-sky-500 text-white font-bold text-xs flex items-center justify-center mb-3">1</span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">เปิด Safari บน iPhone</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  เปิดเบราว์เซอร์ Safari แล้วเข้าไปที่ลิงก์ระบบของบริษัท หรือสแกน QR Code
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <span className="w-7 h-7 rounded-lg bg-sky-500 text-white font-bold text-xs flex items-center justify-center mb-3">2</span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">กดปุ่มแชร์ (Share)</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  กดปุ่มแชร์รูปสี่เหลี่ยมมีลูกศรชี้ขึ้น ที่แถบเมนูด้านล่างของหน้าจอ Safari
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <span className="w-7 h-7 rounded-lg bg-sky-500 text-white font-bold text-xs flex items-center justify-center mb-3">3</span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">เพิ่มไปยังหน้าจอโฮม</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  เลื่อนลงมาเลือก "เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)" ไอคอนแอปจะปรากฏบนหน้าจอหลักทันที
                </p>
              </div>
            </div>
          )}

          {activeTab === 'windows' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <span className="w-7 h-7 rounded-lg bg-indigo-500 text-white font-bold text-xs flex items-center justify-center mb-3">1</span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">ดาวน์โหลดไฟล์ Setup</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  คลิกปุ่มดาวน์โหลดไฟล์ติดตั้ง `.exe` และบันทึกลงในคอมพิวเตอร์
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <span className="w-7 h-7 rounded-lg bg-indigo-500 text-white font-bold text-xs flex items-center justify-center mb-3">2</span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">รันโปรแกรมติดตั้ง</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  ดับเบิลคลิกไฟล์ที่ดาวน์โหลดมา กด Next ตามขั้นตอนเพื่อติดตั้งเข้าเครื่อง
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <span className="w-7 h-7 rounded-lg bg-indigo-500 text-white font-bold text-xs flex items-center justify-center mb-3">3</span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">เปิดใช้งานจาก Desktop</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  เปิดโปรแกรมจากไอคอนบนหน้าจอ Desktop พร้อมตั้งค่าให้แจ้งเตือนอัตโนมัติ
                </p>
              </div>
            </div>
          )}

          {activeTab === 'mac' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <span className="w-7 h-7 rounded-lg bg-slate-800 text-white font-bold text-xs flex items-center justify-center mb-3">1</span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">ดาวน์โหลดไฟล์ .dmg</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  ดาวน์โหลดไฟล์ `.dmg` รองรับทั้งชิป Apple Silicon (M1/M2/M3) และ Intel
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <span className="w-7 h-7 rounded-lg bg-slate-800 text-white font-bold text-xs flex items-center justify-center mb-3">2</span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">ลากเข้าโฟลเดอร์ Applications</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  เปิดไฟล์ .dmg แล้วลากไอคอน HR Studio ไปใส่ในโฟลเดอร์ Applications
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <span className="w-7 h-7 rounded-lg bg-slate-800 text-white font-bold text-xs flex items-center justify-center mb-3">3</span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">เปิดใช้งานได้ทันที</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  เปิดแอปผ่าน Launchpad หรือ Spotlight Search พร้อมใช้งานได้ทันที
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="max-w-6xl mx-auto mb-14">
        <h2 className="text-lg font-bold font-['Prompt'] text-slate-900 dark:text-slate-100 mb-6 text-center">
          ฟีเจอร์เด่นบนแอปพลิเคชัน
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="p-6 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
              <MapPin className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">บันทึกเวลา GPS แม่นยำ</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              เช็คอินและลงเวลาทำงานได้รวดเร็ว พร้อมระบุพิกัดที่ทำงานจริงอย่างแม่นยำ
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3">
              <Bell className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">การแจ้งเตือนทันที</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              ไม่พลาดคำขอลา งานที่ได้รับมอบหมาย หรือการแจ้งเตือนสำคัญจากหัวหน้างาน
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">ความปลอดภัยระดับสูง</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              รองรับการยืนยันตัวตนด้วย Biometric (สแกนลายนิ้วมือ / Face ID)
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
              <Clock className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">ประวัติเวลาเรียลไทม์</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              ตรวจสอบชั่วโมงทำงาน การมาสาย และยอดวันลาคงเหลือได้ตลอด 24 ชั่วโมง
            </p>
          </div>
        </div>
      </div>

      {/* QR Code Scan Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 sm:p-8 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl text-center">
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 font-['Prompt'] mb-1">
              สแกน QR เพื่อดาวน์โหลด
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              ใช้กล้องสมาร์ตโฟนของคุณสแกนคิวอาร์โค้ดนี้เพื่อเปิดหน้าดาวน์โหลดทันที
            </p>

            <div className="w-52 h-52 mx-auto bg-white p-4 rounded-2xl shadow-inner border border-slate-200 flex items-center justify-center mb-6">
              <svg className="w-full h-full text-slate-900" viewBox="0 0 100 100" fill="currentColor">
                <rect x="5" y="5" width="26" height="26" rx="4" fill="currentColor" />
                <rect x="9" y="9" width="18" height="18" rx="2" fill="white" />
                <rect x="13" y="13" width="10" height="10" rx="2" fill="currentColor" />

                <rect x="69" y="5" width="26" height="26" rx="4" fill="currentColor" />
                <rect x="73" y="9" width="18" height="18" rx="2" fill="white" />
                <rect x="77" y="13" width="10" height="10" rx="2" fill="currentColor" />

                <rect x="5" y="69" width="26" height="26" rx="4" fill="currentColor" />
                <rect x="9" y="73" width="18" height="18" rx="2" fill="white" />
                <rect x="13" y="77" width="10" height="10" rx="2" fill="currentColor" />

                <rect x="37" y="9" width="6" height="6" />
                <rect x="47" y="9" width="6" height="6" />
                <rect x="57" y="9" width="6" height="6" />
                <rect x="37" y="21" width="6" height="6" />
                <rect x="51" y="21" width="6" height="6" />

                <rect x="9" y="37" width="6" height="6" />
                <rect x="21" y="37" width="6" height="6" />
                <rect x="37" y="37" width="26" height="26" rx="3" fill="#2563EB" />
                <rect x="69" y="37" width="6" height="6" />
                <rect x="85" y="37" width="6" height="6" />

                <rect x="9" y="47" width="6" height="6" />
                <rect x="21" y="47" width="6" height="6" />
                <rect x="69" y="47" width="6" height="6" />
                <rect x="85" y="47" width="6" height="6" />

                <rect x="37" y="69" width="6" height="6" />
                <rect x="51" y="69" width="6" height="6" />
                <rect x="69" y="69" width="6" height="6" />
                <rect x="81" y="69" width="6" height="6" />
                <rect x="43" y="81" width="6" height="6" />
                <rect x="57" y="81" width="6" height="6" />
                <rect x="73" y="81" width="6" height="6" />
                <rect x="87" y="81" width="6" height="6" />
              </svg>
            </div>

            <button
              type="button"
              onClick={() => setShowQrModal(null)}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
