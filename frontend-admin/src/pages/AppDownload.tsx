import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  QrCode,
  Smartphone,
  X,
} from 'lucide-react';

type MobileApp = {
  label: string;
  name: string;
  icon: string;
  iosUrl: string;
  androidUrl: string;
};

type InstallGuide = {
  app: MobileApp;
  platform: 'ios' | 'android';
};

const TESTFLIGHT_LOGO_URL = 'https://testflight.apple.com/images/testflight-1200_40.jpg';
const APPLE_LOGO_URL = 'https://images.icon-icons.com/887/PNG/512/Apple_icon-icons.com_68994.png';

const MOBILE_APPS: MobileApp[] = [
  {
    label: 'แอป 1',
    name: 'HR Studio Mobile',
    icon: 'https://taskmanagementsystem.wallcraftthailand.com/app_icon_v2.svg',
    iosUrl: 'https://testflight.apple.com/join/8GkTH7K4',
    androidUrl: 'https://drive.google.com/file/d/1axoJFIwn5fuVmphwnTkJXuQXZsxWI6MP/view',
  },
  {
    label: 'แอป 2',
    name: 'Wallcraft',
    icon: 'https://taskmanagementsystem.wallcraftthailand.com/brands/wallcraft.png',
    iosUrl: 'https://testflight.apple.com/join/BXMvdwVM',
    androidUrl: 'https://drive.google.com/file/d/1zK11ohCeWKzEnhC8u1frKTY1W1p-tiib/view',
  },
];

export default function AppDownload() {
  const navigate = useNavigate();
  const [copiedLink, setCopiedLink] = useState(false);
  const [installGuide, setInstallGuide] = useState<InstallGuide | null>(null);

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard access can be blocked by some browsers.
    }
  };

  const isIosGuide = installGuide?.platform === 'ios';
  const guideUrl = installGuide ? (isIosGuide ? installGuide.app.iosUrl : installGuide.app.androidUrl) : '';

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 text-slate-900 dark:bg-[#070b14] dark:text-slate-100 sm:px-6 sm:py-10">
      <main className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            กลับหน้าหลัก
          </button>
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-slate-500 transition-colors hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedLink ? 'คัดลอกแล้ว' : 'แชร์'}
          </button>
        </div>

        <header className="mb-6">
          <h1 className="font-['Prompt'] text-2xl font-extrabold tracking-tight sm:text-3xl">ดาวน์โหลดแอป</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">เลือกแอปและระบบปฏิบัติการของอุปกรณ์คุณ</p>
        </header>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {MOBILE_APPS.map((app) => (
            <article key={app.label} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
              <div className="mb-5 flex items-center gap-4">
                <AppIcon
                  src={app.icon}
                  name={app.name}
                  className="h-16 w-16 rounded-2xl border border-slate-100 bg-white p-1 object-cover shadow-sm dark:border-slate-700"
                  fallbackClassName="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-xl"
                />
                <div className="min-w-0">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{app.label}</span>
                  <h2 className="truncate font-['Prompt'] text-lg font-bold">{app.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">พร้อมติดตั้ง</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setInstallGuide({ app, platform: 'ios' })}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-200 px-3 py-3 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white p-0.5">
                    <img src={APPLE_LOGO_URL} alt="Apple" className="h-full w-full object-contain" />
                  </span>
                  iPhone
                  <QrCode className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setInstallGuide({ app, platform: 'android' })}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
                >
                  <Smartphone className="h-4 w-4" />
                  Android
                  <QrCode className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          ))}
        </section>

        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
          <p>กดปุ่ม iPhone หรือ Android เพื่อดู QR และวิธีติดตั้งของแอปนั้น</p>
        </div>
      </main>

      {installGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInstallGuide(null);
          }}
        >
          <section className="relative w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl dark:bg-[#0f172a] sm:p-6">
            <button
              type="button"
              onClick={() => setInstallGuide(null)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="ปิดหน้าต่าง"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-5 flex items-center gap-3 pr-8">
              <AppIcon
                src={installGuide.app.icon}
                name={installGuide.app.name}
                className="h-11 w-11 rounded-xl border border-slate-200 bg-white p-0.5 object-cover shadow-sm dark:border-slate-700"
                fallbackClassName="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-sm"
              />
              <div>
                <p className={`text-xs font-bold ${isIosGuide ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {installGuide.app.name}
                </p>
                <h2 className="font-['Prompt'] text-lg font-bold">{isIosGuide ? 'ติดตั้งผ่าน TestFlight' : 'ติดตั้งบน Android'}</h2>
              </div>
            </div>

            <div className={`mb-5 flex items-center gap-4 rounded-2xl border p-3 ${isIosGuide ? 'border-blue-100 bg-gradient-to-r from-blue-50 to-sky-50 dark:border-blue-900/50 dark:from-blue-950/50 dark:to-sky-950/30' : 'border-emerald-100 bg-gradient-to-r from-emerald-50 to-teal-50 dark:border-emerald-900/50 dark:from-emerald-950/50 dark:to-teal-950/30'}`}>
              {isIosGuide ? (
                <img src={TESTFLIGHT_LOGO_URL} alt="TestFlight" className="h-16 w-16 rounded-2xl border border-white bg-white object-cover object-center shadow-sm" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm"><Download className="h-7 w-7" /></div>
              )}
              <p className="text-sm font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
                {isIosGuide ? <>ใช้แอป <span className="text-blue-600 dark:text-blue-400">TestFlight</span> ของ Apple เพื่อรับแอปเวอร์ชันทดสอบ</> : <>ดาวน์โหลดไฟล์ <span className="text-emerald-600 dark:text-emerald-400">APK</span> จาก Google Drive แล้วติดตั้งลงในโทรศัพท์</>}
              </p>
            </div>

            <div className="mb-5 grid gap-5 sm:grid-cols-[168px_1fr] sm:items-center">
              <div className="mx-auto w-fit rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&format=svg&data=${encodeURIComponent(guideUrl)}`}
                  alt={`QR Code สำหรับติดตั้ง ${installGuide.app.name}`}
                  className="h-36 w-36"
                />
                <p className="mt-1.5 text-center text-[11px] font-medium text-slate-500">สแกนด้วยกล้องมือถือ</p>
              </div>

              {isIosGuide ? (
                <ol className="space-y-3 text-sm leading-snug text-slate-600 dark:text-slate-300">
                  <li className="flex gap-2.5"><StepNumber color="blue" value="1" /><span>ติดตั้ง <strong>TestFlight</strong> จาก App Store หากยังไม่มี</span></li>
                  <li className="flex gap-2.5"><StepNumber color="blue" value="2" /><span>สแกน QR นี้ หรือกดปุ่มเปิด TestFlight</span></li>
                  <li className="flex gap-2.5"><StepNumber color="blue" value="3" /><span>กด <strong>Install</strong> ในหน้า TestFlight</span></li>
                </ol>
              ) : (
                <ol className="space-y-3 text-sm leading-snug text-slate-600 dark:text-slate-300">
                  <li className="flex gap-2.5"><StepNumber color="green" value="1" /><span>สแกน QR นี้ หรือกดปุ่มเปิดไฟล์ Android</span></li>
                  <li className="flex gap-2.5"><StepNumber color="green" value="2" /><span>กด <strong>Download</strong> ในหน้า Google Drive</span></li>
                  <li className="flex gap-2.5"><StepNumber color="green" value="3" /><span>เปิดไฟล์ APK แล้วอนุญาตการติดตั้งหากเครื่องถาม</span></li>
                </ol>
              )}
            </div>

            <a
              href={guideUrl}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition-colors ${isIosGuide ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            >
              {isIosGuide ? <img src={TESTFLIGHT_LOGO_URL} alt="" className="h-4 w-4 rounded object-cover" /> : <Download className="h-4 w-4" />}
              {isIosGuide ? 'เปิด TestFlight' : 'เปิดไฟล์ Android'}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </section>
        </div>
      )}
    </div>
  );
}

function StepNumber({ color, value }: { color: 'blue' | 'green'; value: string }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${color === 'blue' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
      {value}
    </span>
  );
}

function AppIcon({
  src,
  name,
  className,
  fallbackClassName,
}: {
  src: string;
  name: string;
  className: string;
  fallbackClassName: string;
}) {
  const [failedToLoad, setFailedToLoad] = useState(false);

  if (failedToLoad) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center font-['Prompt'] font-extrabold text-white shadow-sm ${fallbackClassName}`}
        role="img"
        aria-label={`ไอคอน ${name}`}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return <img src={src} alt={`ไอคอนแอป ${name}`} className={className} onError={() => setFailedToLoad(true)} />;
}
