import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BookOpenCheck, Building2, GraduationCap, KeyRound, LoaderCircle, LockKeyhole, LogOut, ShieldCheck, Trophy, UserRound } from 'lucide-react'
import { AchievementForm } from '@/components/AchievementForm'
import { AdminDashboard } from '@/components/AdminDashboard'
import { api } from '@/lib/api'
import type { RecordType, Session } from '@/lib/types'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [selected, setSelected] = useState<RecordType | null>(null)
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api<Session>('session').then(setSession).catch(() => setSession(null)).finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    if (!session) return
    const reset = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
      inactivityTimer.current = setTimeout(() => void logout(), 30 * 60_000)
    }
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }))
    reset()
    return () => { events.forEach((event) => window.removeEventListener(event, reset)); if (inactivityTimer.current) clearTimeout(inactivityTimer.current) }
  }, [session])

  async function logout() {
    await api('logout', { method: 'POST' }).catch(() => null)
    setSession(null); setSelected(null)
  }

  if (checking) return <div className="app-loading"><div className="brand-seal small"><span>SMK</span><strong>B</strong></div><LoaderCircle className="spin" /><span>Menyediakan sistem…</span></div>
  if (!session) return <Login onLogin={setSession} />

  return <div className="app-frame">
    <header className="topbar"><div className="brand-lockup"><div className="brand-seal small"><span>SMK</span><strong>B</strong></div><div><strong>Sistem Rekod Pencapaian</strong><span>SMK Bandau</span></div></div><div className="topbar-actions"><span className="role-pill"><ShieldCheck size={15} /> {session.role === 'admin' ? 'Pentadbir' : 'Guru'}</span><button onClick={() => void logout()}><LogOut size={17} /> Log Keluar</button></div></header>
    <main className={session.role === 'admin' ? 'admin-main' : 'teacher-main'}>
      {session.role === 'admin' ? <AdminDashboard csrf={session.csrf} /> : selected ? <AchievementForm type={selected} csrf={session.csrf} onBack={() => setSelected(null)} /> : <TeacherHome onSelect={setSelected} />}
    </main>
    <footer><span>© 2026 SMK Bandau</span><span>Rekod rasmi · Zon waktu Asia/Kuching</span></footer>
  </div>
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('')
    const form = new FormData(event.currentTarget)
    try { onLogin(await api<Session>('login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) })) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Log masuk tidak berjaya.') }
    finally { setLoading(false) }
  }
  return <main className="login-page"><div className="login-atmosphere"><div className="orb one" /><div className="orb two" /></div><section className="login-intro"><div className="brand-seal"><span>SMK</span><strong>B</strong></div><p className="eyebrow light">Portal Rasmi SMK Bandau</p><h1>Sistem Rekod<br /><em>Pencapaian</em> Guru<br />dan Sekolah</h1><p>Pengurusan rekod berpusat yang selamat, tersusun dan mudah dicapai oleh warga sekolah.</p><div className="trust-row"><span><ShieldCheck /> Akses selamat</span><span><BookOpenCheck /> Rekod kekal</span></div></section><section className="login-card"><div className="login-card-head"><span className="login-icon"><KeyRound /></span><div><p className="eyebrow">Selamat datang</p><h2>Log Masuk Sistem</h2></div></div><p className="login-note">Gunakan akaun guru atau pentadbir yang telah ditetapkan.</p><form onSubmit={submit}><label><span>Nama Pengguna</span><div className="input-icon"><UserRound /><input name="username" autoComplete="username" required placeholder="Masukkan nama pengguna" /></div></label><label><span>Kata Laluan</span><div className="input-icon"><LockKeyhole /><input name="password" type="password" autoComplete="current-password" required placeholder="Masukkan kata laluan" /></div></label>{error && <div className="error-message">{error}</div>}<button className="primary-button login-button" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <ArrowRight />}{loading ? 'Mengesahkan…' : 'Log Masuk'}</button></form><div className="security-note"><LockKeyhole /><span>Sesi dilindungi dan tamat secara automatik selepas 30 minit tidak aktif.</span></div></section></main>
}

function TeacherHome({ onSelect }: { onSelect: (type: RecordType) => void }) {
  return <div className="teacher-home animate-in"><section className="teacher-hero"><div><p className="eyebrow light">Modul Guru</p><h1>Rekodkan pencapaian,<br /><em>abadikan kecemerlangan.</em></h1><p>Pilih jenis rekod untuk memulakan penghantaran. Rekod yang telah dihantar tidak boleh diubah atau dipadam.</p></div><div className="hero-trophy"><Trophy /></div></section><div className="choice-heading"><span>01</span><div><h2>Pilih Jenis Pencapaian</h2><p>Setiap borang mengambil masa kira-kira 3–5 minit.</p></div></div><div className="choice-grid"><button className="choice-card teacher" onClick={() => onSelect('teacher')}><span className="choice-icon"><GraduationCap /></span><small>INDIVIDU</small><h3>Daftar Pencapaian Guru</h3><p>Rekod anugerah, pertandingan, profesionalisme, inovasi dan pencapaian individu guru.</p><span className="choice-link">Buka borang <ArrowRight /></span></button><button className="choice-card school" onClick={() => onSelect('school')}><span className="choice-icon"><Building2 /></span><small>INSTITUSI</small><h3>Daftar Pencapaian Sekolah</h3><p>Rekod kejayaan yang mewakili sekolah pada semua peringkat dan kategori.</p><span className="choice-link">Buka borang <ArrowRight /></span></button></div></div>
}
