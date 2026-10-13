import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const achievements = pgTable('achievements', {
  id: uuid('id').defaultRandom().primaryKey(),
  referenceNumber: text('reference_number').notNull().unique(),
  recordType: text('record_type').notNull(),
  teacherName: text('teacher_name'),
  teacherId: text('teacher_id'),
  positionOrField: text('position_or_field'),
  achievementLevel: text('achievement_level').notNull(),
  activityCategory: text('activity_category').notNull(),
  activityName: text('activity_name').notNull(),
  achievementResult: text('achievement_result').notNull(),
  achievementYear: integer('achievement_year').notNull(),
  achievementDate: timestamp('achievement_date', { mode: 'date' }),
  ppd: text('ppd'),
  coordinatorName: text('coordinator_name'),
  notes: text('notes'),
  status: text('status').notNull().default('Menunggu fail'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('achievements_year_idx').on(table.achievementYear),
  index('achievements_type_idx').on(table.recordType),
  index('achievements_level_idx').on(table.achievementLevel),
  index('achievements_created_idx').on(table.createdAt),
])

export const uploadedFiles = pgTable('uploaded_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  achievementId: uuid('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
  originalFilename: text('original_filename').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  uploadToken: text('upload_token').notNull(),
  chunkCount: integer('chunk_count').notNull(),
  uploadComplete: boolean('upload_complete').notNull().default(false),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [index('uploaded_files_achievement_idx').on(table.achievementId)])

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  action: text('action').notNull(),
  achievementId: uuid('achievement_id').references(() => achievements.id, { onDelete: 'set null' }),
  role: text('role').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [index('audit_logs_created_idx').on(table.createdAt)])

export const referenceCounters = pgTable('reference_counters', {
  id: uuid('id').defaultRandom().primaryKey(),
  recordType: text('record_type').notNull(),
  achievementYear: integer('achievement_year').notNull(),
  currentValue: integer('current_value').notNull().default(0),
}, (table) => [uniqueIndex('reference_counter_unique').on(table.recordType, table.achievementYear)])

export const securityEvents = pgTable('security_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventType: text('event_type').notNull(),
  identifier: text('identifier').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [index('security_events_lookup_idx').on(table.eventType, table.identifier, table.createdAt)])
