# AGENTS.md

## Gambaran Projek

Sistem Rekod Pencapaian Guru dan Sekolah SMK Bandau ialah aplikasi TanStack Start/React berbahasa Melayu yang dideploy ke Netlify. Guru hanya menghantar rekod; pentadbir mengurus semua rekod dan fail.

## Seni Bina

- `src/routes/index.tsx` — shell aplikasi, log masuk, pemilihan modul guru dan dashboard berasaskan peranan.
- `src/components/AchievementForm.tsx` — borang guru, validasi fail dan muat naik berketul.
- `src/components/AdminDashboard.tsx` — statistik, tapisan, jadual, modal butiran/edit, eksport dan ZIP.
- `src/lib/` — jenis bersama, format tarikh Malaysia dan pembungkus API.
- `netlify/functions/api.ts` — satu Netlify Function berlaluan `/api/*`; semua authorization dibuat di sini.
- `netlify/functions/_shared.ts` — sesi, CSRF, bcrypt, rate limit dan respons bersama.
- `db/schema.ts` — skema Drizzle untuk Netlify Database.
- `netlify/database/migrations/` — migrasi automatik Netlify termasuk data contoh.
- Netlify Blobs store `achievement-files` — dokumen bukti persendirian.

## Konvensyen

- Gunakan Bahasa Melayu untuk semua teks pengguna dan mesej ralat.
- Gunakan camelCase dalam TypeScript dan snake_case bagi nama kolum Postgres.
- Jangan akses database atau Blobs dari frontend.
- Semua endpoint baharu mesti memanggil `requireRole`; operasi state-changing mesti mengaktifkan semakan CSRF.
- Gunakan Drizzle expressions untuk parameterized queries. Jangan bina SQL daripada input pengguna.
- Jangan simpan rahsia, token muat naik atau storage key dalam respons awam.
- Format tarikh menggunakan `Asia/Kuching` dan `ms-MY`.

## Perubahan Database

Kemas kini `db/schema.ts`, kemudian jana migrasi bernama melalui `pnpm db:generate --name <nama_snake_case>`. Jangan jalankan migrasi secara manual; Netlify menggunakannya semasa deployment.

## Muat Naik

Fail maksimum 10 MB, maksimum lima fail, dan format dibenarkan ditakrifkan pada frontend serta backend. Setiap fail dipecahkan kepada bahagian 2 MB dan disatukan oleh function sebelum rekod ditandakan `Aktif`.

## Keputusan Tidak Jelas

- Akaun guru dikongsi, jadi guru tidak mempunyai halaman sejarah. Ringkasan hanya dipaparkan selepas penghantaran semasa.
- Fail tidak mempunyai URL awam kekal. Pratonton PDF/gambar juga melalui endpoint pentadbir.
- ZIP melebihi 40 MB ditolak dengan cadangan menapis tahun atau jenis rekod untuk mengawal memori function.
- Rekod contoh sengaja tidak mempunyai fail bukti palsu.
