import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { and, asc, count, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import { db } from '../../db/index.js'
import { achievements, auditLogs, referenceCounters, uploadedFiles } from '../../db/schema.js'
import { createSession, errorResponse, getSession, json, rateLimit, requireRole, safeFilename, SESSION_COOKIE, verifyCredentials } from './_shared.js'

const store = () => getStore({ name: 'achievement-files', consistency: 'strong' })
const levels = ['Sekolah', 'Daerah', 'Negeri', 'Kebangsaan', 'Antarabangsa'] as const
const categories = ['Akademik', 'Kokurikulum', 'Sukan', 'Inovasi', 'STEM', 'TVET', 'Kajian tindakan', 'Profesionalisme', 'Anugerah', 'Lain-lain'] as const
const allowedMime = new Set([
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png',
])
const allowedExt = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'])
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_CHUNK_SIZE = 2.5 * 1024 * 1024

function validFileSignature(buffer: ArrayBuffer, mimeType: string) {
  const bytes = new Uint8Array(buffer.slice(0, 16))
  const text = new TextDecoder().decode(bytes).toLowerCase()
  if ((bytes[0] === 0x4d && bytes[1] === 0x5a) || text.startsWith('#!') || text.includes('<?php')) return false
  if (mimeType === 'application/pdf') return text.startsWith('%pdf')
  if (mimeType === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === 'application/msword' || mimeType === 'application/vnd.ms-excel') return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
  if (mimeType.includes('openxmlformats-officedocument')) return bytes[0] === 0x50 && bytes[1] === 0x4b
  return false
}

const nullableText = z.string().trim().max(1000).optional().nullable().transform((value) => value || null)
const recordSchema = z.object({
  recordType: z.enum(['teacher', 'school']),
  teacherName: nullableText,
  teacherId: nullableText,
  positionOrField: nullableText,
  achievementLevel: z.enum(levels),
  activityCategory: z.enum(categories),
  activityName: z.string().trim().min(2).max(300),
  achievementResult: z.string().trim().min(2).max(300),
  achievementYear: z.number().int().min(1990).max(2100),
  achievementDate: z.string().optional().nullable(),
  ppd: nullableText,
  coordinatorName: nullableText,
  notes: nullableText,
  idempotencyKey: z.string().uuid(),
  files: z.array(z.object({
    name: z.string().min(1).max(255),
    type: z.string().min(1).max(150),
    size: z.number().int().positive().max(MAX_FILE_SIZE),
    chunks: z.number().int().min(1).max(8),
  })).min(1).max(5),
}).superRefine((data, ctx) => {
  if (data.recordType === 'teacher' && !data.teacherName) ctx.addIssue({ code: 'custom', path: ['teacherName'], message: 'Nama guru wajib diisi.' })
  if (data.recordType === 'school' && !data.coordinatorName) ctx.addIssue({ code: 'custom', path: ['coordinatorName'], message: 'Guru penyelaras wajib diisi.' })
  for (const file of data.files) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!allowedExt.has(ext) || !allowedMime.has(file.type)) ctx.addIssue({ code: 'custom', path: ['files'], message: `Jenis fail ${file.name} tidak dibenarkan.` })
  }
})

const editSchema = z.object({
  teacherName: nullableText,
  teacherId: nullableText,
  positionOrField: nullableText,
  achievementLevel: z.enum(levels).optional(),
  activityCategory: z.enum(categories).optional(),
  activityName: z.string().trim().min(2).max(300).optional(),
  achievementResult: z.string().trim().min(2).max(300).optional(),
  achievementYear: z.number().int().min(1990).max(2100).optional(),
  achievementDate: z.string().optional().nullable(),
  ppd: nullableText,
  coordinatorName: nullableText,
  notes: nullableText,
})

type Filters = ReturnType<typeof parseFilters>
function parseFilters(url: URL) {
  return {
    search: url.searchParams.get('search')?.trim() || '',
    recordType: url.searchParams.get('recordType') || '',
    year: Number(url.searchParams.get('year')) || 0,
    level: url.searchParams.get('level') || '',
    category: url.searchParams.get('category') || '',
    ppd: url.searchParams.get('ppd')?.trim() || '',
    from: url.searchParams.get('from') || '',
    to: url.searchParams.get('to') || '',
  }
}

function whereFromFilters(filters: Filters) {
  const clauses = [eq(achievements.status, 'Aktif')]
  if (filters.search) clauses.push(or(
    ilike(achievements.teacherName, `%${filters.search}%`),
    ilike(achievements.coordinatorName, `%${filters.search}%`),
    ilike(achievements.activityName, `%${filters.search}%`),
    ilike(achievements.referenceNumber, `%${filters.search}%`),
  )!)
  if (filters.recordType) clauses.push(eq(achievements.recordType, filters.recordType))
  if (filters.year) clauses.push(eq(achievements.achievementYear, filters.year))
  if (filters.level) clauses.push(eq(achievements.achievementLevel, filters.level))
  if (filters.category) clauses.push(eq(achievements.activityCategory, filters.category))
  if (filters.ppd) clauses.push(ilike(achievements.ppd, `%${filters.ppd}%`))
  if (filters.from) clauses.push(gte(achievements.createdAt, new Date(`${filters.from}T00:00:00+08:00`)))
  if (filters.to) clauses.push(lte(achievements.createdAt, new Date(`${filters.to}T23:59:59+08:00`)))
  return and(...clauses)
}

async function nextReference(recordType: 'teacher' | 'school', year: number) {
  const [counter] = await db.insert(referenceCounters).values({ recordType, achievementYear: year, currentValue: 1 })
    .onConflictDoUpdate({
      target: [referenceCounters.recordType, referenceCounters.achievementYear],
      set: { currentValue: sql`${referenceCounters.currentValue} + 1` },
    }).returning({ value: referenceCounters.currentValue })
  return `${recordType === 'teacher' ? 'PCG' : 'PCS'}-${year}-${String(counter.value).padStart(4, '0')}`
}

async function login(req: Request, context: Context) {
  if (!(await rateLimit('login', context.ip || 'unknown', 5, 15))) return errorResponse('Terlalu banyak cubaan log masuk. Cuba lagi dalam 15 minit.', 429)
  const body = await req.json().catch(() => null) as { username?: string; password?: string } | null
  if (!body?.username || !body.password) return errorResponse('Nama pengguna dan kata laluan diperlukan.')
  const role = await verifyCredentials(body.username.trim(), body.password)
  if (!role) return errorResponse('Nama pengguna atau kata laluan tidak betul.', 401)
  const session = await createSession(context, role, body.username.trim())
  await db.insert(auditLogs).values({ action: 'LOG_MASUK', role, description: `${role === 'admin' ? 'Pentadbir' : 'Guru'} log masuk.` })
  return json(session)
}

async function sessionRoute(context: Context) {
  const session = await getSession(context)
  if (!session) return errorResponse('Tiada sesi aktif.', 401)
  return json(session)
}

async function createRecord(req: Request, context: Context) {
  const auth = await requireRole(req, context, ['teacher', 'admin'], true)
  if (auth.response) return auth.response
  if (!(await rateLimit('record-create', context.ip || 'unknown', 20, 15))) return errorResponse('Had penghantaran sementara dicapai. Cuba sebentar lagi.', 429)
  const parsed = recordSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message || 'Maklumat rekod tidak sah.')
  const data = parsed.data
  const [existing] = await db.select().from(achievements).where(eq(achievements.idempotencyKey, data.idempotencyKey)).limit(1)
  if (existing) {
    const existingFiles = await db.select().from(uploadedFiles).where(eq(uploadedFiles.achievementId, existing.id))
    return json({ duplicate: true, record: existing, files: existingFiles.map(({ id, uploadToken, chunkCount }) => ({ id, uploadToken, chunkCount })) })
  }
  const referenceNumber = await nextReference(data.recordType, data.achievementYear)
  const [record] = await db.insert(achievements).values({
    referenceNumber,
    recordType: data.recordType,
    teacherName: data.teacherName,
    teacherId: data.teacherId,
    positionOrField: data.positionOrField,
    achievementLevel: data.achievementLevel,
    activityCategory: data.activityCategory,
    activityName: data.activityName,
    achievementResult: data.achievementResult,
    achievementYear: data.achievementYear,
    achievementDate: data.achievementDate ? new Date(`${data.achievementDate}T00:00:00+08:00`) : null,
    ppd: data.ppd,
    coordinatorName: data.coordinatorName,
    notes: data.notes,
    idempotencyKey: data.idempotencyKey,
  }).returning()
  const fileRows = await db.insert(uploadedFiles).values(data.files.map((file) => ({
    achievementId: record.id,
    originalFilename: safeFilename(file.name),
    storageKey: `records/${referenceNumber}/${crypto.randomUUID()}`,
    mimeType: file.type,
    fileSize: file.size,
    uploadToken: crypto.randomUUID(),
    chunkCount: file.chunks,
  }))).returning()
  await db.insert(auditLogs).values({ action: 'CIPTA_REKOD', achievementId: record.id, role: auth.session!.role, description: `Rekod ${referenceNumber} dimulakan.` })
  return json({ record, files: fileRows.map(({ id, uploadToken, chunkCount }) => ({ id, uploadToken, chunkCount })) }, 201)
}

async function uploadChunk(req: Request, context: Context, fileId: string, index: number) {
  const auth = await requireRole(req, context, ['teacher', 'admin'], true)
  if (auth.response) return auth.response
  if (!(await rateLimit('upload-chunk', context.ip || 'unknown', 150, 15))) return errorResponse('Terlalu banyak permintaan muat naik. Cuba sebentar lagi.', 429)
  const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId)).limit(1)
  if (!file || req.headers.get('x-upload-token') !== file.uploadToken) return errorResponse('Token muat naik tidak sah.', 403)
  if (file.uploadComplete || index < 0 || index >= file.chunkCount) return errorResponse('Bahagian fail tidak sah.')
  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > MAX_CHUNK_SIZE + 1024) return errorResponse('Saiz bahagian fail melebihi had.', 413)
  const buffer = await req.arrayBuffer()
  if (!buffer.byteLength || buffer.byteLength > MAX_CHUNK_SIZE) return errorResponse('Saiz bahagian fail tidak sah.', 413)
  await store().set(`${file.storageKey}.part.${index}`, buffer)
  return json({ uploaded: true, index })
}

async function completeUpload(req: Request, context: Context, fileId: string) {
  const auth = await requireRole(req, context, ['teacher', 'admin'], true)
  if (auth.response) return auth.response
  const [file] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, fileId)).limit(1)
  if (!file || req.headers.get('x-upload-token') !== file.uploadToken) return errorResponse('Token muat naik tidak sah.', 403)
  const chunks: ArrayBuffer[] = []
  let total = 0
  for (let index = 0; index < file.chunkCount; index += 1) {
    const chunk = await store().get(`${file.storageKey}.part.${index}`, { type: 'arrayBuffer' }) as ArrayBuffer | null
    if (!chunk) return errorResponse('Muat naik belum lengkap. Sila cuba semula.', 409)
    chunks.push(chunk)
    total += chunk.byteLength
  }
  if (total !== file.fileSize || total > MAX_FILE_SIZE) return errorResponse('Saiz fail tidak sepadan.', 400)
  const combined = new Blob(chunks, { type: file.mimeType })
  const signatureBuffer = await combined.slice(0, 32).arrayBuffer()
  if (!validFileSignature(signatureBuffer, file.mimeType)) {
    await Promise.all(chunks.map((_, index) => store().delete(`${file.storageKey}.part.${index}`)))
    return errorResponse('Kandungan fail tidak sepadan dengan format yang dibenarkan.', 400)
  }
  await store().set(file.storageKey, combined)
  await Promise.all(chunks.map((_, index) => store().delete(`${file.storageKey}.part.${index}`)))
  await db.update(uploadedFiles).set({ uploadComplete: true, uploadedAt: new Date() }).where(eq(uploadedFiles.id, file.id))
  return json({ completed: true })
}

async function finalizeRecord(req: Request, context: Context, recordId: string) {
  const auth = await requireRole(req, context, ['teacher', 'admin'], true)
  if (auth.response) return auth.response
  const [record] = await db.select().from(achievements).where(eq(achievements.id, recordId)).limit(1)
  if (!record) return errorResponse('Rekod tidak ditemui.', 404)
  if (record.status === 'Aktif') return json({ record, duplicate: true })
  const files = await db.select().from(uploadedFiles).where(eq(uploadedFiles.achievementId, recordId))
  if (!files.length || files.some((file) => !file.uploadComplete)) return errorResponse('Semua fail bukti mesti selesai dimuat naik.', 409)
  const [updated] = await db.update(achievements).set({ status: 'Aktif', updatedAt: new Date() }).where(eq(achievements.id, recordId)).returning()
  await db.insert(auditLogs).values({ action: 'HANTAR_REKOD', achievementId: recordId, role: auth.session!.role, description: `Rekod ${record.referenceNumber} berjaya dihantar.` })
  return json({ record: updated, files: files.map(({ originalFilename, mimeType, fileSize }) => ({ originalFilename, mimeType, fileSize })) })
}

async function listRecords(req: Request, context: Context) {
  const auth = await requireRole(req, context, ['admin'])
  if (auth.response) return auth.response
  const url = new URL(req.url)
  const filters = parseFilters(url)
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = [10, 25, 50, 100].includes(Number(url.searchParams.get('pageSize'))) ? Number(url.searchParams.get('pageSize')) : 10
  const where = whereFromFilters(filters)
  const rows = await db.select({
    id: achievements.id,
    referenceNumber: achievements.referenceNumber,
    recordType: achievements.recordType,
    teacherName: achievements.teacherName,
    coordinatorName: achievements.coordinatorName,
    achievementLevel: achievements.achievementLevel,
    activityCategory: achievements.activityCategory,
    activityName: achievements.activityName,
    achievementResult: achievements.achievementResult,
    achievementYear: achievements.achievementYear,
    ppd: achievements.ppd,
    createdAt: achievements.createdAt,
    status: achievements.status,
    fileCount: count(uploadedFiles.id),
  }).from(achievements).leftJoin(uploadedFiles, eq(uploadedFiles.achievementId, achievements.id)).where(where)
    .groupBy(achievements.id).orderBy(desc(achievements.createdAt)).limit(pageSize).offset((page - 1) * pageSize)
  const [totalRow] = await db.select({ value: count() }).from(achievements).where(where)
  const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Kuching' }).format(new Date()))
  const [allCount, teacherCount, schoolCount, yearCount, fileCount] = await Promise.all([
    db.select({ value: count() }).from(achievements).where(eq(achievements.status, 'Aktif')),
    db.select({ value: count() }).from(achievements).where(and(eq(achievements.status, 'Aktif'), eq(achievements.recordType, 'teacher'))),
    db.select({ value: count() }).from(achievements).where(and(eq(achievements.status, 'Aktif'), eq(achievements.recordType, 'school'))),
    db.select({ value: count() }).from(achievements).where(and(eq(achievements.status, 'Aktif'), eq(achievements.achievementYear, currentYear))),
    db.select({ value: count() }).from(uploadedFiles).where(eq(uploadedFiles.uploadComplete, true)),
  ])
  const byLevel = await db.select({ level: achievements.achievementLevel, value: count() }).from(achievements).where(eq(achievements.status, 'Aktif')).groupBy(achievements.achievementLevel).orderBy(asc(achievements.achievementLevel))
  return json({ rows, total: Number(totalRow?.value || 0), page, pageSize, summary: {
    all: Number(allCount[0]?.value || 0), teacher: Number(teacherCount[0]?.value || 0), school: Number(schoolCount[0]?.value || 0),
    currentYear: Number(yearCount[0]?.value || 0), files: Number(fileCount[0]?.value || 0), byLevel,
  } })
}

async function getRecord(req: Request, context: Context, id: string) {
  const auth = await requireRole(req, context, ['admin'])
  if (auth.response) return auth.response
  const [record] = await db.select().from(achievements).where(eq(achievements.id, id)).limit(1)
  if (!record) return errorResponse('Rekod tidak ditemui.', 404)
  const files = await db.select({ id: uploadedFiles.id, originalFilename: uploadedFiles.originalFilename, mimeType: uploadedFiles.mimeType, fileSize: uploadedFiles.fileSize, uploadedAt: uploadedFiles.uploadedAt }).from(uploadedFiles).where(and(eq(uploadedFiles.achievementId, id), eq(uploadedFiles.uploadComplete, true)))
  return json({ record, files })
}

async function editRecord(req: Request, context: Context, id: string) {
  const auth = await requireRole(req, context, ['admin'], true)
  if (auth.response) return auth.response
  const parsed = editSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message || 'Maklumat kemas kini tidak sah.')
  const values = { ...parsed.data, achievementDate: parsed.data.achievementDate ? new Date(`${parsed.data.achievementDate}T00:00:00+08:00`) : parsed.data.achievementDate === null ? null : undefined, updatedAt: new Date() }
  const [record] = await db.update(achievements).set(values).where(eq(achievements.id, id)).returning()
  if (!record) return errorResponse('Rekod tidak ditemui.', 404)
  await db.insert(auditLogs).values({ action: 'EDIT_REKOD', achievementId: id, role: 'admin', description: `Rekod ${record.referenceNumber} dikemas kini.` })
  return json({ record })
}

async function deleteRecord(req: Request, context: Context, id: string) {
  const auth = await requireRole(req, context, ['admin'], true)
  if (auth.response) return auth.response
  const [record] = await db.select().from(achievements).where(eq(achievements.id, id)).limit(1)
  if (!record) return errorResponse('Rekod tidak ditemui.', 404)
  const files = await db.select().from(uploadedFiles).where(eq(uploadedFiles.achievementId, id))
  await Promise.all(files.flatMap((file) => [store().delete(file.storageKey), ...Array.from({ length: file.chunkCount }, (_, index) => store().delete(`${file.storageKey}.part.${index}`))]))
  await db.insert(auditLogs).values({ action: 'PADAM_REKOD', achievementId: id, role: 'admin', description: `Rekod ${record.referenceNumber} dipadam bersama ${files.length} fail.` })
  await db.delete(achievements).where(eq(achievements.id, id))
  return json({ deleted: true })
}

async function downloadFile(req: Request, context: Context, id: string) {
  const auth = await requireRole(req, context, ['admin'])
  if (auth.response) return auth.response
  const [file] = await db.select().from(uploadedFiles).where(and(eq(uploadedFiles.id, id), eq(uploadedFiles.uploadComplete, true))).limit(1)
  if (!file) return errorResponse('Fail tidak ditemui.', 404)
  const stream = await store().get(file.storageKey, { type: 'stream' }) as ReadableStream | null
  if (!stream) return errorResponse('Fail tidak tersedia dalam storan.', 404)
  const preview = new URL(req.url).searchParams.get('preview') === '1' && (file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/'))
  await db.insert(auditLogs).values({ action: preview ? 'PRATONTON_FAIL' : 'MUAT_TURUN_FAIL', achievementId: file.achievementId, role: 'admin', description: `${preview ? 'Pratonton' : 'Muat turun'} fail ${file.originalFilename}.` })
  return new Response(stream, { headers: {
    'Content-Type': file.mimeType,
    'Content-Length': String(file.fileSize),
    'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.originalFilename)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } })
}

const exportRows = async (filters: Filters) => db.select({
  referenceNumber: achievements.referenceNumber, recordType: achievements.recordType, teacherName: achievements.teacherName,
  coordinatorName: achievements.coordinatorName, achievementLevel: achievements.achievementLevel, activityCategory: achievements.activityCategory,
  activityName: achievements.activityName, achievementResult: achievements.achievementResult, achievementYear: achievements.achievementYear,
  achievementDate: achievements.achievementDate, ppd: achievements.ppd, notes: achievements.notes, status: achievements.status, createdAt: achievements.createdAt,
}).from(achievements).where(whereFromFilters(filters)).orderBy(desc(achievements.createdAt)).limit(10000)

function bmRows(rows: Awaited<ReturnType<typeof exportRows>>) {
  const date = (value: Date | null) => value ? new Intl.DateTimeFormat('ms-MY', { timeZone: 'Asia/Kuching' }).format(value) : ''
  return rows.map((row) => ({
    'Nombor Rujukan': row.referenceNumber, 'Jenis Rekod': row.recordType === 'teacher' ? 'Pencapaian Guru' : 'Pencapaian Sekolah',
    'Nama Guru': row.teacherName || '', 'Guru Penyelaras': row.coordinatorName || '', 'Peringkat': row.achievementLevel,
    'Kategori': row.activityCategory, 'Aktiviti / Pertandingan': row.activityName, 'Pencapaian / Anugerah': row.achievementResult,
    'Tahun': row.achievementYear, 'Tarikh Pencapaian': date(row.achievementDate), 'PPD': row.ppd || '', 'Catatan': row.notes || '',
    'Status': row.status, 'Tarikh Dihantar': date(row.createdAt),
  }))
}

async function exportData(req: Request, context: Context, format: 'csv' | 'xlsx') {
  const auth = await requireRole(req, context, ['admin'])
  if (auth.response) return auth.response
  const rows = bmRows(await exportRows(parseFilters(new URL(req.url))))
  const sheet = XLSX.utils.json_to_sheet(rows)
  let body: Uint8Array
  let type: string
  if (format === 'csv') {
    body = new TextEncoder().encode('\uFEFF' + XLSX.utils.sheet_to_csv(sheet))
    type = 'text/csv; charset=utf-8'
  } else {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Rekod Pencapaian')
    body = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
    type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  await db.insert(auditLogs).values({ action: 'EKSPORT_DATA', role: 'admin', description: `Eksport ${rows.length} rekod dalam format ${format.toUpperCase()}.` })
  return new Response(body, { headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="rekod-pencapaian.${format}"`, 'Cache-Control': 'no-store' } })
}

async function zipFiles(req: Request, context: Context, recordId?: string) {
  const auth = await requireRole(req, context, ['admin'])
  if (auth.response) return auth.response
  const filters = parseFilters(new URL(req.url))
  const where = recordId ? eq(achievements.id, recordId) : whereFromFilters(filters)
  const rows = await db.select({ file: uploadedFiles, record: achievements }).from(uploadedFiles).innerJoin(achievements, eq(uploadedFiles.achievementId, achievements.id)).where(and(where, eq(uploadedFiles.uploadComplete, true))).limit(500)
  const totalSize = rows.reduce((sum, row) => sum + row.file.fileSize, 0)
  if (!rows.length) return errorResponse('Tiada fail ditemui untuk pilihan ini.', 404)
  if (totalSize > 40 * 1024 * 1024) {
    const years = [...new Set(rows.map((row) => row.record.achievementYear))].sort((a, b) => b - a)
    return json({ error: 'Jumlah fail terlalu besar untuk satu ZIP. Pilih satu tahun atau jenis rekod.', suggestions: { years, recordTypes: ['teacher', 'school'] } }, 413)
  }
  const zip = new JSZip()
  for (const row of rows) {
    const data = await store().get(row.file.storageKey, { type: 'arrayBuffer' }) as ArrayBuffer | null
    if (!data) continue
    const type = row.record.recordType === 'teacher' ? 'Pencapaian Guru' : 'Pencapaian Sekolah'
    const filename = `${row.record.referenceNumber}-${safeFilename(row.file.originalFilename)}`
    zip.file(`${row.record.achievementYear}/${type}/${row.record.referenceNumber}/${filename}`, data)
  }
  const archive = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  await db.insert(auditLogs).values({ action: 'MUAT_TURUN_ZIP', role: 'admin', description: `ZIP dijana untuk ${rows.length} fail.` })
  return new Response(archive, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="fail-pencapaian${recordId ? '-rekod' : ''}.zip"`, 'Cache-Control': 'no-store' } })
}

export default async function handler(req: Request, context: Context) {
  try {
    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
    if (req.method === 'POST' && path[0] === 'login') return login(req, context)
    if (req.method === 'GET' && path[0] === 'session') return sessionRoute(context)
    if (req.method === 'POST' && path[0] === 'logout') {
      context.cookies.delete(SESSION_COOKIE)
      return json({ loggedOut: true })
    }
    if (req.method === 'POST' && path[0] === 'records' && path.length === 1) return createRecord(req, context)
    if (req.method === 'POST' && path[0] === 'uploads' && path[2] === 'chunks') return uploadChunk(req, context, path[1], Number(path[3]))
    if (req.method === 'POST' && path[0] === 'uploads' && path[2] === 'complete') return completeUpload(req, context, path[1])
    if (req.method === 'POST' && path[0] === 'records' && path[2] === 'finalize') return finalizeRecord(req, context, path[1])
    if (req.method === 'GET' && path[0] === 'records' && path.length === 1) return listRecords(req, context)
    if (req.method === 'GET' && path[0] === 'records' && path[2] === 'zip') return zipFiles(req, context, path[1])
    if (req.method === 'GET' && path[0] === 'records' && path.length === 2) return getRecord(req, context, path[1])
    if (req.method === 'PATCH' && path[0] === 'records' && path.length === 2) return editRecord(req, context, path[1])
    if (req.method === 'DELETE' && path[0] === 'records' && path.length === 2) return deleteRecord(req, context, path[1])
    if (req.method === 'GET' && path[0] === 'files' && path.length === 2) return downloadFile(req, context, path[1])
    if (req.method === 'GET' && path[0] === 'export' && (path[1] === 'csv' || path[1] === 'xlsx')) return exportData(req, context, path[1])
    if (req.method === 'GET' && path[0] === 'zip') return zipFiles(req, context)
    return errorResponse('Endpoint tidak ditemui.', 404)
  } catch (error) {
    console.error(error)
    return errorResponse('Ralat pelayan berlaku. Sila cuba lagi.', 500)
  }
}

export const config: Config = { path: '/api/*' }
