export type Role = 'teacher' | 'admin'
export type Session = { role: Role; username: string; csrf: string }
export type RecordType = 'teacher' | 'school'

export type Achievement = {
  id: string
  referenceNumber: string
  recordType: RecordType
  teacherName: string | null
  teacherId?: string | null
  positionOrField?: string | null
  achievementLevel: string
  activityCategory: string
  activityName: string
  achievementResult: string
  achievementYear: number
  achievementDate?: string | null
  ppd: string | null
  coordinatorName: string | null
  notes?: string | null
  status: string
  createdAt: string
  updatedAt?: string
  fileCount?: number
}

export type UploadedFile = {
  id: string
  originalFilename: string
  mimeType: string
  fileSize: number
  uploadedAt: string
}

export const LEVELS = ['Sekolah', 'Daerah', 'Negeri', 'Kebangsaan', 'Antarabangsa']
export const CATEGORIES = ['Akademik', 'Kokurikulum', 'Sukan', 'Inovasi', 'STEM', 'TVET', 'Kajian tindakan', 'Profesionalisme', 'Anugerah', 'Lain-lain']
export const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Kuching' }).format(new Date()))
export const years = Array.from({ length: 12 }, (_, index) => currentYear + 1 - index)

export const formatDate = (value?: string | Date | null) => value
  ? new Intl.DateTimeFormat('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kuching' }).format(new Date(value))
  : '—'
export const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`
