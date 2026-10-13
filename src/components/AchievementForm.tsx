import { useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, FileText, LoaderCircle, Plus, Send, Trash2, UploadCloud } from 'lucide-react'
import { api } from '@/lib/api'
import { CATEGORIES, currentYear, formatBytes, LEVELS, type Achievement, type RecordType, years } from '@/lib/types'

const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png']
const maxSize = 10 * 1024 * 1024
const chunkSize = 2 * 1024 * 1024
const mimeByExtension: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
}

type Props = { type: RecordType; csrf: string; onBack: () => void }
type Success = { record: Achievement; files: Array<{ originalFilename: string; mimeType: string; fileSize: number }> }

export function AchievementForm({ type, csrf, onBack }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [success, setSuccess] = useState<Success | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const title = type === 'teacher' ? 'Pencapaian Guru' : 'Pencapaian Sekolah'
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files])

  function chooseFiles(selected: FileList | null) {
    if (!selected) return
    const next = [...files, ...Array.from(selected)]
    if (next.length > 5) return setError('Maksimum lima fail dibenarkan bagi setiap rekod.')
    for (const file of next) {
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      if (!allowedExtensions.includes(extension)) return setError(`Fail ${file.name} mempunyai format yang tidak dibenarkan.`)
      if (file.size > maxSize) return setError(`Fail ${file.name} melebihi had 10 MB.`)
    }
    setError('')
    setFiles(next)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!files.length) return setError('Sekurang-kurangnya satu dokumen bukti diperlukan.')
    setLoading(true)
    setError('')
    setProgress(1)
    const form = new FormData(event.currentTarget)
    const value = (name: string) => String(form.get(name) || '').trim()
    try {
      const created = await api<{ duplicate?: boolean; record: Achievement; files?: Array<{ id: string; uploadToken: string; chunkCount: number }> }>('records', {
        method: 'POST',
        body: JSON.stringify({
          recordType: type,
          teacherName: type === 'teacher' ? value('teacherName') : null,
          teacherId: type === 'teacher' ? value('teacherId') : null,
          positionOrField: type === 'teacher' ? value('positionOrField') : null,
          achievementLevel: value('achievementLevel'), activityCategory: value('activityCategory'),
          activityName: value('activityName'), achievementResult: value('achievementResult'), achievementYear: Number(value('achievementYear')),
          achievementDate: value('achievementDate') || null, ppd: value('ppd') || null,
          coordinatorName: type === 'school' ? value('coordinatorName') : null, notes: value('notes') || null,
          idempotencyKey,
          files: files.map((file) => ({ name: file.name, type: mimeByExtension[file.name.split('.').pop()?.toLowerCase() || ''], size: file.size, chunks: Math.ceil(file.size / chunkSize) })),
        }),
      }, csrf)
      if (created.duplicate && created.record.status === 'Aktif') {
        setSuccess({ record: created.record, files: [] })
        return
      }
      if (!created.files) throw new Error('Maklumat muat naik tidak diterima.')
      let uploadedBytes = 0
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex]
        const target = created.files[fileIndex]
        for (let index = 0; index < target.chunkCount; index += 1) {
          const chunk = file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize))
          await api(`uploads/${target.id}/chunks/${index}`, { method: 'POST', body: chunk, headers: { 'X-Upload-Token': target.uploadToken, 'Content-Type': 'application/octet-stream' } }, csrf)
          uploadedBytes += chunk.size
          setProgress(Math.max(2, Math.round((uploadedBytes / totalBytes) * 94)))
        }
        await api(`uploads/${target.id}/complete`, { method: 'POST', headers: { 'X-Upload-Token': target.uploadToken } }, csrf)
      }
      const result = await api<Success>(`records/${created.record.id}/finalize`, { method: 'POST' }, csrf)
      setProgress(100)
      setSuccess(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Rekod gagal dihantar.')
    } finally {
      setLoading(false)
    }
  }

  if (success) return (
    <section className="success-panel animate-in">
      <div className="success-icon"><CheckCircle2 /></div>
      <p className="eyebrow">Penghantaran selesai</p>
      <h2>Rekod berjaya dihantar</h2>
      <p className="reference-number">{success.record.referenceNumber}</p>
      <div className="success-summary">
        <div><span>Jenis rekod</span><strong>{title}</strong></div>
        <div><span>Aktiviti</span><strong>{success.record.activityName}</strong></div>
        <div><span>Pencapaian</span><strong>{success.record.achievementResult}</strong></div>
        <div><span>Tahun</span><strong>{success.record.achievementYear}</strong></div>
      </div>
      <button className="primary-button" onClick={() => { setSuccess(null); setFiles([]); setProgress(0); setIdempotencyKey(crypto.randomUUID()) }}><Plus size={18} /> Daftar Rekod Baharu</button>
    </section>
  )

  return (
    <section className="form-shell animate-in">
      <button className="text-button" onClick={onBack}><ArrowLeft size={18} /> Kembali ke pilihan</button>
      <div className="section-heading"><div><p className="eyebrow">Borang rasmi</p><h2>Daftar {title}</h2><p>Lengkapkan maklumat dan lampirkan dokumen bukti.</p></div><span className="type-mark">{type === 'teacher' ? 'PG' : 'PS'}</span></div>
      <form onSubmit={submit} className="achievement-form">
        <div className="form-grid">
          {type === 'teacher' ? <>
            <label><span>Nama guru *</span><input name="teacherName" required maxLength={200} /></label>
            <label><span>Nombor kad pengenalan / ID guru</span><input name="teacherId" maxLength={100} /></label>
            <label className="full"><span>Jawatan atau bidang</span><input name="positionOrField" maxLength={200} /></label>
          </> : <label className="full"><span>Guru penyelaras *</span><input name="coordinatorName" required maxLength={200} /></label>}
          <label><span>Peringkat pencapaian *</span><select name="achievementLevel" required defaultValue=""><option value="" disabled>Pilih peringkat</option>{LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Kategori aktiviti *</span><select name="activityCategory" required defaultValue=""><option value="" disabled>Pilih kategori</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="full"><span>Nama aktiviti atau pertandingan *</span><input name="activityName" required maxLength={300} /></label>
          <label className="full"><span>Pencapaian atau anugerah *</span><input name="achievementResult" required maxLength={300} /></label>
          <label><span>Tahun *</span><select name="achievementYear" required defaultValue={currentYear}>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
          <label><span>Tarikh pencapaian</span><input name="achievementDate" type="date" /></label>
          <label className="full"><span>PPD</span><input name="ppd" maxLength={200} placeholder="Contoh: PPD Kota Marudu" /></label>
          <label className="full"><span>Catatan</span><textarea name="notes" rows={4} maxLength={1000} /></label>
        </div>
        <div className="upload-box">
          <div><UploadCloud size={28} /><strong>Dokumen bukti *</strong><p>PDF, DOC, DOCX, XLS, XLSX, JPG atau PNG · maksimum 10 MB setiap fail · sehingga 5 fail</p></div>
          <label className="secondary-button file-picker"><Plus size={17} /> Pilih Fail<input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={(event) => { chooseFiles(event.target.files); event.target.value = '' }} /></label>
        </div>
        {files.length > 0 && <div className="file-list">{files.map((file, index) => <div className="file-row" key={`${file.name}-${index}`}><FileText size={20} /><div><strong>{file.name}</strong><span>{file.type || 'Jenis fail'} · {formatBytes(file.size)}</span></div><button type="button" aria-label="Buang fail" onClick={() => setFiles((items) => items.filter((_, fileIndex) => fileIndex !== index))}><Trash2 size={18} /></button></div>)}</div>}
        {loading && <div className="progress-wrap"><div><span>Memuat naik dokumen…</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
        {error && <div className="error-message">{error}</div>}
        <button className="primary-button submit-button" disabled={loading}>{loading ? <LoaderCircle className="spin" size={19} /> : <Send size={18} />}{loading ? ' Sedang menghantar…' : ' Hantar Rekod'}</button>
      </form>
    </section>
  )
}
