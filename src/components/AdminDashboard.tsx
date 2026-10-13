import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, Award, ChevronLeft, ChevronRight, Download, Edit3, Eye, FileArchive, FileDown, FileText, FilterX, GraduationCap, LoaderCircle, RefreshCw, Save, School, Search, Trash2, Trophy, Users, X } from 'lucide-react'
import { api, download } from '@/lib/api'
import { CATEGORIES, formatBytes, formatDate, LEVELS, type Achievement, type UploadedFile, years } from '@/lib/types'

type Summary = { all: number; teacher: number; school: number; currentYear: number; files: number; byLevel: Array<{ level: string; value: number }> }
type ListResponse = { rows: Achievement[]; total: number; page: number; pageSize: number; summary: Summary }
type Detail = { record: Achievement; files: UploadedFile[] }
type Filters = { search: string; recordType: string; year: string; level: string; category: string; ppd: string; from: string; to: string }
const initialFilters: Filters = { search: '', recordType: '', year: '', level: '', category: '', ppd: '', from: '', to: '' }

export function AdminDashboard({ csrf }: { csrf: string }) {
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [applied, setApplied] = useState<Filters>(initialFilters)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editing, setEditing] = useState(false)

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    Object.entries(applied).forEach(([key, value]) => value && params.set(key, value))
    return params.toString()
  }, [applied, page, pageSize])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await api<ListResponse>(`records?${query}`)) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Rekod gagal dimuatkan.') }
    finally { setLoading(false) }
  }, [query])

  useEffect(() => { void load() }, [load])

  async function openDetail(id: string, edit = false) {
    setDetailLoading(true); setEditing(edit)
    try { setDetail(await api<Detail>(`records/${id}`)) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Butiran rekod gagal dimuatkan.') }
    finally { setDetailLoading(false) }
  }

  async function remove(record: Achievement) {
    if (!window.confirm(`Padam rekod ${record.referenceNumber} dan semua fail berkaitan? Tindakan ini tidak boleh dibatalkan.`)) return
    try { await api(`records/${record.id}`, { method: 'DELETE' }, csrf); setDetail(null); await load() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Rekod gagal dipadam.') }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail) return
    const form = new FormData(event.currentTarget)
    const values = Object.fromEntries(form.entries())
    try {
      await api(`records/${detail.record.id}`, { method: 'PATCH', body: JSON.stringify({ ...values, achievementYear: Number(values.achievementYear), achievementDate: values.achievementDate || null }) }, csrf)
      setEditing(false); await openDetail(detail.record.id); await load()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Rekod gagal dikemas kini.') }
  }

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / pageSize))
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(applied).forEach(([key, value]) => value && params.set(key, value))
    return params.toString()
  }, [applied])

  return (
    <div className="admin-dashboard animate-in">
      <div className="admin-title-row"><div><p className="eyebrow">Pusat kawalan</p><h1>Dashboard Pentadbir</h1><p>Pantau, urus dan eksport rekod pencapaian sekolah.</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCw size={17} /> Segar Semula</button></div>
      {data && <>
        <div className="stat-grid">
          <Stat icon={Archive} label="Jumlah semua rekod" value={data.summary.all} tone="dark" />
          <Stat icon={GraduationCap} label="Pencapaian guru" value={data.summary.teacher} tone="green" />
          <Stat icon={School} label="Pencapaian sekolah" value={data.summary.school} tone="sage" />
          <Stat icon={Trophy} label="Tahun semasa" value={data.summary.currentYear} tone="gold" />
          <Stat icon={FileText} label="Jumlah fail" value={data.summary.files} tone="slate" />
        </div>
        <div className="level-strip"><span><Award size={18} /> Mengikut peringkat</span>{LEVELS.map((level) => <div key={level}><strong>{data.summary.byLevel.find((item) => item.level === level)?.value || 0}</strong><small>{level}</small></div>)}</div>
      </>}

      <section className="admin-panel">
        <div className="panel-heading"><div><h2>Senarai Rekod</h2><p>{data?.total || 0} rekod sepadan dengan tapisan.</p></div><div className="action-cluster"><button className="secondary-button" onClick={() => download(`export/csv?${exportQuery}`)}><FileDown size={17} /> CSV</button><button className="secondary-button" onClick={() => download(`export/xlsx?${exportQuery}`)}><FileDown size={17} /> Excel</button><button className="primary-button" onClick={() => download(`zip?${exportQuery}`)}><FileArchive size={17} /> Muat Turun Semua Fail</button></div></div>
        <form className="filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setApplied(filters) }}>
          <label className="search-field"><Search size={17} /><input aria-label="Carian" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Nama guru, aktiviti atau nombor rujukan" /></label>
          <select aria-label="Jenis rekod" value={filters.recordType} onChange={(event) => setFilters({ ...filters, recordType: event.target.value })}><option value="">Semua jenis</option><option value="teacher">Pencapaian Guru</option><option value="school">Pencapaian Sekolah</option></select>
          <select aria-label="Tahun" value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })}><option value="">Semua tahun</option>{years.map((year) => <option key={year}>{year}</option>)}</select>
          <select aria-label="Peringkat" value={filters.level} onChange={(event) => setFilters({ ...filters, level: event.target.value })}><option value="">Semua peringkat</option>{LEVELS.map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label="Kategori" value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="">Semua kategori</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
          <input aria-label="PPD" value={filters.ppd} onChange={(event) => setFilters({ ...filters, ppd: event.target.value })} placeholder="PPD" />
          <label className="date-filter"><span>Dari</span><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
          <label className="date-filter"><span>Hingga</span><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
          <button className="primary-button" type="submit"><Search size={17} /> Cari & Tapis</button>
          <button className="text-button" type="button" onClick={() => { setFilters(initialFilters); setApplied(initialFilters); setPage(1) }}><FilterX size={17} /> Kosongkan</button>
        </form>

        {error && <div className="error-message">{error}</div>}
        <div className="table-wrap">
          <table><thead><tr><th>Bil</th><th>Nombor rujukan</th><th>Jenis rekod</th><th>Nama guru / penyelaras</th><th>Peringkat</th><th>Kategori</th><th>Aktiviti</th><th>Pencapaian</th><th>Tahun</th><th>PPD</th><th>Tarikh dihantar</th><th>Fail</th><th>Status</th><th>Tindakan</th></tr></thead>
            <tbody>{loading ? <tr><td colSpan={14}><div className="table-state"><LoaderCircle className="spin" /> Memuatkan rekod…</div></td></tr> : !data?.rows.length ? <tr><td colSpan={14}><div className="empty-state"><Search /><strong>Tiada rekod ditemui</strong><span>Cuba ubah atau kosongkan tapisan carian.</span></div></td></tr> : data.rows.map((record, index) => <tr key={record.id}>
              <td>{(page - 1) * pageSize + index + 1}</td><td><strong className="ref-cell">{record.referenceNumber}</strong></td><td><span className={`type-badge ${record.recordType}`}>{record.recordType === 'teacher' ? 'Guru' : 'Sekolah'}</span></td><td>{record.teacherName || record.coordinatorName || '—'}</td><td>{record.achievementLevel}</td><td>{record.activityCategory}</td><td>{record.activityName}</td><td>{record.achievementResult}</td><td>{record.achievementYear}</td><td>{record.ppd || '—'}</td><td>{formatDate(record.createdAt)}</td><td>{record.fileCount}</td><td><span className="status-badge">{record.status}</span></td><td><div className="row-actions"><button title="Lihat" onClick={() => void openDetail(record.id)}><Eye size={17} /></button><button title="Edit" onClick={() => void openDetail(record.id, true)}><Edit3 size={17} /></button><button title="Muat turun semua fail rekod" onClick={() => download(`records/${record.id}/zip`)}><Download size={17} /></button><button className="danger" title="Padam" onClick={() => void remove(record)}><Trash2 size={17} /></button></div></td>
            </tr>)}</tbody></table>
        </div>
        <div className="pagination"><label>Papar <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>{[10, 25, 50, 100].map((size) => <option key={size}>{size}</option>)}</select> rekod</label><span>Halaman {page} daripada {totalPages}</span><div><button disabled={page === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={18} /></button><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight size={18} /></button></div></div>
      </section>

      {(detailLoading || detail) && <div className="modal-backdrop" onMouseDown={() => { if (!detailLoading) setDetail(null) }}><div className="detail-modal" onMouseDown={(event) => event.stopPropagation()}>
        {detailLoading ? <div className="table-state"><LoaderCircle className="spin" /> Memuatkan butiran…</div> : detail && <>
          <div className="modal-heading"><div><p className="eyebrow">Butiran rekod</p><h2>{detail.record.referenceNumber}</h2></div><button className="icon-button" onClick={() => setDetail(null)}><X /></button></div>
          {editing ? <EditForm detail={detail} onSubmit={save} onCancel={() => setEditing(false)} /> : <>
            <div className="detail-grid">{[
              ['Jenis rekod', detail.record.recordType === 'teacher' ? 'Pencapaian Guru' : 'Pencapaian Sekolah'],
              ['Nama guru', detail.record.teacherName], ['ID guru', detail.record.teacherId], ['Jawatan / bidang', detail.record.positionOrField],
              ['Guru penyelaras', detail.record.coordinatorName], ['Peringkat', detail.record.achievementLevel], ['Kategori', detail.record.activityCategory],
              ['Aktiviti / pertandingan', detail.record.activityName], ['Pencapaian / anugerah', detail.record.achievementResult], ['Tahun', String(detail.record.achievementYear)],
              ['Tarikh pencapaian', formatDate(detail.record.achievementDate)], ['PPD', detail.record.ppd], ['Catatan', detail.record.notes], ['Tarikh dihantar', formatDate(detail.record.createdAt)],
            ].filter(([, value]) => value).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
            <div className="files-section"><div className="files-heading"><h3>Dokumen Bukti</h3><button className="secondary-button" onClick={() => download(`records/${detail.record.id}/zip`)}><FileArchive size={17} /> Muat turun semua</button></div>{detail.files.map((file) => <div className="admin-file" key={file.id}><FileText size={20} /><div><strong>{file.originalFilename}</strong><span>{file.mimeType} · {formatBytes(file.fileSize)} · {formatDate(file.uploadedAt)}</span></div><div>{(file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/')) && <button onClick={() => window.open(`/api/files/${file.id}?preview=1`, '_blank', 'noopener,noreferrer')}><Eye size={17} /> Pratonton</button>}<button onClick={() => download(`files/${file.id}`)}><Download size={17} /> Muat turun</button></div></div>)}</div>
            <div className="modal-actions"><button className="secondary-button" onClick={() => setEditing(true)}><Edit3 size={17} /> Edit Rekod</button><button className="danger-button" onClick={() => void remove(detail.record)}><Trash2 size={17} /> Padam Rekod</button></div>
          </>}
        </>}
      </div></div>}
    </div>
  )
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number; tone: string }) {
  return <div className={`stat-card ${tone}`}><div><span>{label}</span><strong>{value}</strong></div><Icon /></div>
}

function EditForm({ detail, onSubmit, onCancel }: { detail: Detail; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const record = detail.record
  return <form className="edit-form" onSubmit={onSubmit}><div className="form-grid">
    {record.recordType === 'teacher' ? <><label><span>Nama guru *</span><input name="teacherName" defaultValue={record.teacherName || ''} required /></label><label><span>ID guru</span><input name="teacherId" defaultValue={record.teacherId || ''} /></label><label className="full"><span>Jawatan / bidang</span><input name="positionOrField" defaultValue={record.positionOrField || ''} /></label></> : <label className="full"><span>Guru penyelaras *</span><input name="coordinatorName" defaultValue={record.coordinatorName || ''} required /></label>}
    <label><span>Peringkat *</span><select name="achievementLevel" defaultValue={record.achievementLevel}>{LEVELS.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label><span>Kategori *</span><select name="activityCategory" defaultValue={record.activityCategory}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="full"><span>Aktiviti *</span><input name="activityName" defaultValue={record.activityName} required /></label><label className="full"><span>Pencapaian *</span><input name="achievementResult" defaultValue={record.achievementResult} required /></label>
    <label><span>Tahun *</span><select name="achievementYear" defaultValue={record.achievementYear}>{years.map((year) => <option key={year}>{year}</option>)}</select></label><label><span>Tarikh pencapaian</span><input name="achievementDate" type="date" defaultValue={record.achievementDate ? new Date(record.achievementDate).toISOString().slice(0, 10) : ''} /></label>
    <label className="full"><span>PPD</span><input name="ppd" defaultValue={record.ppd || ''} /></label><label className="full"><span>Catatan</span><textarea name="notes" defaultValue={record.notes || ''} rows={4} /></label>
  </div><div className="modal-actions"><button className="text-button" type="button" onClick={onCancel}>Batal</button><button className="primary-button"><Save size={17} /> Simpan Perubahan</button></div></form>
}
