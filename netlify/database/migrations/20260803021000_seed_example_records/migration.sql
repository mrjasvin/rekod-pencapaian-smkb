INSERT INTO "achievements" (
  "reference_number", "record_type", "teacher_name", "position_or_field", "achievement_level", "activity_category",
  "activity_name", "achievement_result", "achievement_year", "achievement_date", "ppd", "coordinator_name", "notes", "status", "idempotency_key", "created_at", "updated_at"
) VALUES
  ('PCG-2026-0001', 'teacher', 'Cikgu Nur Aina Abdullah', 'Guru Akademik STEM', 'Negeri', 'Inovasi',
   'Pertandingan Inovasi Pendidikan Sabah', 'Pingat Emas', 2026, '2026-05-18', 'PPD Kota Marudu', NULL,
   'Data contoh Pencapaian Guru untuk paparan awal sistem.', 'Aktif', '11111111-1111-4111-8111-111111111111', '2026-05-20 08:30:00+08', '2026-05-20 08:30:00+08'),
  ('PCS-2026-0001', 'school', NULL, NULL, 'Kebangsaan', 'Kokurikulum',
   'Karnival Kelab dan Persatuan Sekolah Menengah', 'Naib Johan Kebangsaan', 2026, '2026-06-12', 'PPD Kota Marudu', 'Cikgu Mohd Faizal Rahman',
   'Data contoh Pencapaian Sekolah untuk paparan awal sistem.', 'Aktif', '22222222-2222-4222-8222-222222222222', '2026-06-15 10:15:00+08', '2026-06-15 10:15:00+08')
ON CONFLICT ("reference_number") DO NOTHING;

INSERT INTO "reference_counters" ("record_type", "achievement_year", "current_value") VALUES
  ('teacher', 2026, 1), ('school', 2026, 1)
ON CONFLICT ("record_type", "achievement_year") DO UPDATE SET "current_value" = GREATEST("reference_counters"."current_value", EXCLUDED."current_value");
