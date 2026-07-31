import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  Mail,
  ImagePlus,
  Pencil,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchMe, updateMyProfile, uploadFile } from '../services/adminApi';
import type { User } from '../types';
import { avatarUrl } from '../components/tasks/taskUtils';
import AvatarCropModal from '../components/AvatarCropModal';

type AvatarOption = {
  label: string;
  style: 'ผู้หญิง' | 'ผู้ชาย';
  url: string;
};

const AVATAR_OPTIONS: AvatarOption[] = [
  { label: 'ผู้หญิง 1', style: 'ผู้หญิง', url: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Ananya&backgroundColor=fde7f3' },
  { label: 'ผู้หญิง 2', style: 'ผู้หญิง', url: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Praew&backgroundColor=e0f2fe' },
  { label: 'ผู้หญิง 3', style: 'ผู้หญิง', url: 'https://api.dicebear.com/9.x/lorelei/svg?seed=Mali&backgroundColor=fef3c7' },
  { label: 'ผู้ชาย 1', style: 'ผู้ชาย', url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Krit&backgroundColor=dbeafe' },
  { label: 'ผู้ชาย 2', style: 'ผู้ชาย', url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Than&backgroundColor=dcfce7' },
  { label: 'ผู้ชาย 3', style: 'ผู้ชาย', url: 'https://api.dicebear.com/9.x/adventurer/svg?seed=Boss&backgroundColor=f3e8ff' },
];

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [avatarURL, setAvatarURL] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState('avatar.jpg');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    void fetchMe()
      .then((currentUser) => {
        setUser(currentUser);
        setFirstName(currentUser.first_name || '');
        setLastName(currentUser.last_name || '');
        setNickname(currentUser.nickname || '');
        setEmail(currentUser.email || '');
        setAvatarURL(currentUser.avatar_url || AVATAR_OPTIONS[0].url);
      })
      .catch(() => setError('โหลดข้อมูลโปรไฟล์ไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, []);

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarMenuOpen(false);
    clearMessages();
    if (!file.type.startsWith('image/')) {
      setError('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('รูปภาพต้องมีขนาดไม่เกิน 5 MB');
      return;
    }

    setCropFileName(file.name);
    setCropSource(URL.createObjectURL(file));
  }

  function closeCropModal() {
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource(null);
  }

  async function handleCroppedAvatar(file: File) {
    closeCropModal();
    setUploadingAvatar(true);
    try {
      const result = await uploadFile(file);
      if (!result.ok || !result.url) {
        throw new Error('ไม่พบ URL ของรูปภาพที่อัปโหลด');
      }
      setAvatarURL(result.url);
      setSuccess('อัปโหลดรูปแล้ว กรุณากด “บันทึกข้อมูลโปรไฟล์” เพื่อใช้งาน');
    } catch (uploadError: any) {
      setError(uploadError?.message || 'อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    const nextEmail = email.trim();
    if (!firstName.trim() || !lastName.trim() || !nickname.trim() || !nextEmail || !avatarURL) {
      setError('กรุณากรอกชื่อ นามสกุล ชื่อเล่น อีเมล และเลือกรูป Avatar ให้ครบ');
      return;
    }

    setSavingProfile(true);
    const currentEmail = user?.email?.trim().toLowerCase() || '';
    if (nextEmail.toLowerCase() !== currentEmail) {
      const { error: emailError } = await supabase.auth.updateUser({ email: nextEmail });
      if (emailError) {
        setSavingProfile(false);
        setError(emailError.message || 'เปลี่ยนอีเมลไม่สำเร็จ');
        return;
      }
    }

    try {
      await updateMyProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        nickname: nickname.trim(),
        email: nextEmail,
        avatar_url: avatarURL,
      });
      setUser((currentUser) => currentUser
        ? {
          ...currentUser,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          nickname: nickname.trim(),
          email: nextEmail,
          avatar_url: avatarURL,
        }
        : currentUser);
      setSuccess(nextEmail.toLowerCase() !== currentEmail
        ? 'บันทึกข้อมูลแล้ว กรุณาตรวจสอบอีเมลเพื่อยืนยันอีเมลใหม่'
        : 'บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || 'บันทึกข้อมูลโปรไฟล์ไม่สำเร็จ');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    if (currentPassword.length < 6) {
      setError('กรุณากรอกรหัสผ่านเดิมให้ครบอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (password.length < 6) {
      setError('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (password !== confirmPassword) {
      setError('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setSavingPassword(true);
    const { data: authData, error: authUserError } = await supabase.auth.getUser();
    const authEmail = authData.user?.email || user?.email || '';
    if (authUserError || !authEmail) {
      setSavingPassword(false);
      setCurrentPassword('');
      setError('ไม่พบอีเมลของบัญชีที่กำลังเข้าสู่ระบบ');
      return;
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: currentPassword,
    });
    if (verifyError) {
      setSavingPassword(false);
      setCurrentPassword('');
      setError('รหัสผ่านเดิมไม่ถูกต้อง');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (updateError) {
      setCurrentPassword('');
      setError(updateError.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      return;
    }
    setCurrentPassword('');
    setPassword('');
    setConfirmPassword('');
    setSuccess('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
  }

  if (loading) {
    return <div className="page-loading"><LoaderCircle className="backup-spin" size={24} /> กำลังโหลดโปรไฟล์...</div>;
  }

  return (
    <section className="profile-page">
      <div className="profile-header">
        <div className="profile-eyebrow"><UserRound size={15} /> ACCOUNT PROFILE</div>
        <h1>โปรไฟล์ของฉัน</h1>
        <p>แก้ไขข้อมูลที่ใช้แสดงในระบบ เลือก Avatar ได้โดยไม่ต้องใช้รูปหน้าจริง</p>
      </div>

      {error && <div className="profile-message error" role="alert">{error}</div>}
      {success && <div className="profile-message success"><CheckCircle2 size={17} /> {success}</div>}

      <div className="profile-grid">
        <article className="profile-card">
          <div className="profile-card-heading"><UserRound size={19} /><div><h2>แก้ไขโปรไฟล์</h2><p>รูป Avatar ข้อมูลส่วนตัว และข้อมูลที่ใช้ในระบบ</p></div></div>
          <form className="profile-password-form" onSubmit={handleSaveProfile}>
            <div className="profile-avatar-picker">
              <div className="profile-avatar-picker-heading"><strong>รูปโปรไฟล์</strong><span>กดดินสอเพื่อเปลี่ยนรูป</span></div>
              <div className="profile-avatar-edit-shell">
                <div className="profile-current-avatar">
                  {avatarUrl(avatarURL) ? <img src={avatarUrl(avatarURL) || undefined} alt="รูปโปรไฟล์ที่เลือก" /> : <UserRound size={30} />}
                </div>
                <button
                  className="profile-avatar-edit-button"
                  type="button"
                  onClick={() => setAvatarMenuOpen(open => !open)}
                  aria-label="เปลี่ยนรูปโปรไฟล์"
                  aria-expanded={avatarMenuOpen}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? <LoaderCircle className="backup-spin" size={15} /> : <Pencil size={15} />}
                </button>

                {avatarMenuOpen && (
                  <div className="profile-avatar-edit-menu">
                    <button
                      className="profile-avatar-source-button"
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <ImagePlus size={17} />
                      <span><strong>เลือกรูปจากเครื่อง</strong><small>รองรับ JPG, PNG, WEBP ไม่เกิน 5 MB</small></span>
                    </button>
                    <div className="profile-avatar-menu-label">เลือก Avatar</div>
                    <div className="profile-avatar-options">
                      {AVATAR_OPTIONS.map((avatar) => {
                        const selected = avatarURL === avatar.url;
                        return (
                          <button
                            className={`profile-avatar-option ${selected ? 'selected' : ''}`}
                            type="button"
                            key={avatar.url}
                            onClick={() => {
                              setAvatarURL(avatar.url);
                              setAvatarMenuOpen(false);
                            }}
                            title={avatar.label}
                          >
                            <img src={avatar.url} alt={avatar.label} />
                            {selected && <span className="profile-avatar-check"><Check size={13} /></span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <input ref={avatarInputRef} className="profile-hidden-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarUpload} />
            </div>

            <div className="profile-name-fields">
              <label>ชื่อ<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label>
              <label>นามสกุล<input value={lastName} onChange={(event) => setLastName(event.target.value)} required /></label>
            </div>
            <label>ชื่อเล่น<input value={nickname} onChange={(event) => setNickname(event.target.value)} required /></label>
            <div className="profile-admin-managed-note"><ShieldCheck size={17} /><span>ตำแหน่งและทีมกำหนดโดย Admin</span></div>
            <label>ตำแหน่ง<input value={user?.position || 'ยังไม่ได้ระบุ'} readOnly /></label>
            <label>ทีม<input value={user?.team || 'ยังไม่ได้ระบุ'} readOnly /></label>
            <label>อีเมล<div className="profile-input-with-icon"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></label>
            <label>สิทธิ์การใช้งาน<input value={user?.role === 'admin' ? 'Admin' : 'พนักงาน'} readOnly /></label>

            <button className="btn-primary profile-action-button" type="submit" disabled={savingProfile || uploadingAvatar}>
              {savingProfile ? <LoaderCircle className="backup-spin" size={17} /> : <Save size={17} />}
              บันทึกข้อมูลโปรไฟล์
            </button>
          </form>
        </article>

        <article className="profile-card">
          <div className="profile-card-heading"><KeyRound size={19} /><div><h2>เปลี่ยนรหัสผ่าน</h2><p>รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร</p></div></div>
          <div className="profile-security-note"><ShieldCheck size={18} /><span>ต้องยืนยันรหัสผ่านเดิมก่อน ระบบจึงจะเปลี่ยนเป็นรหัสผ่านใหม่ให้</span></div>
          <form className="profile-password-form" onSubmit={handleChangePassword}>
            <label>รหัสผ่านเดิม<input type="password" minLength={6} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
            <label>รหัสผ่านใหม่<input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label>
            <label>ยืนยันรหัสผ่านใหม่<input type="password" minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label>
            <button className="btn-primary profile-action-button" type="submit" disabled={savingPassword}>
              {savingPassword ? <LoaderCircle className="backup-spin" size={17} /> : <KeyRound size={17} />}
              บันทึกรหัสผ่านใหม่
            </button>
          </form>
        </article>
      </div>
      {cropSource && <AvatarCropModal source={cropSource} fileName={cropFileName} onCancel={closeCropModal} onConfirm={handleCroppedAvatar} />}
    </section>
  );
}
