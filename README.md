# Sistem Rekod Pencapaian Guru dan Sekolah — SMK Bandau

Aplikasi web rasmi berbahasa Melayu untuk guru menghantar rekod pencapaian dan pentadbir mengurus, mencari, mengemas kini, mengeksport serta memuat turun rekod dan dokumen bukti.

## Teknologi

- React 19 + TypeScript melalui TanStack Start
- Netlify Functions untuk semua operasi backend
- Netlify Database (PostgreSQL) + Drizzle ORM untuk data berstruktur
- Netlify Blobs untuk fail persendirian yang kekal antara deployment
- Cookie sesi JWT `httpOnly`, `secure`, `sameSite=Strict`
- bcrypt untuk pengesahan hash kata laluan
- SheetJS untuk Excel/CSV dan JSZip untuk arkib ZIP

## Fungsi Utama

- Akaun guru bersama yang hanya boleh menghantar Pencapaian Guru atau Pencapaian Sekolah
- Akaun pentadbir untuk dashboard, carian, tapisan, pagination, lihat, edit, padam, eksport dan muat turun
- Muat naik sehingga 5 fail, maksimum 10 MB setiap fail, dengan semakan frontend/backend dan progress bar
- Muat naik berketul untuk mengelakkan had saiz permintaan fungsi; fail akhir disimpan secara persendirian dalam Netlify Blobs
- Nombor rujukan atomik `PCG-TAHUN-XXXX` dan `PCS-TAHUN-XXXX`
- Perlindungan penghantaran berganda menggunakan kunci idempotensi
- Audit log, rate limiting, CSRF token, parameterized queries dan kawalan peranan di backend
- Tarikh Malaysia serta zon waktu `Asia/Kuching`

## Environment Variables

Tetapkan pemboleh ubah berikut dalam **Netlify → Site configuration → Environment variables**. Jangan masukkan nilainya ke dalam repositori.

```text
TEACHER_USERNAME
TEACHER_PASSWORD_HASH
ADMIN_USERNAME
ADMIN_PASSWORD_HASH
SESSION_SECRET
```

Jana hash bcrypt secara tempatan tanpa menyimpan kata laluan teks biasa:

```bash
node -e "import('bcryptjs').then(async ({hash}) => console.log(await hash(process.argv[1], 12)))" 'KATA_LALUAN_ANDA'
```

Jana `SESSION_SECRET` rawak sekurang-kurangnya 32 aksara:

```bash
openssl rand -base64 48
```

Masukkan output terus ke Netlify Environment Variables. Jangan tampal output ke fail `.env` yang dikongsi atau ke kod frontend.

## Database dan Migrasi

Skema Drizzle terletak di `db/schema.ts`. Migrasi SQL berada dalam `netlify/database/migrations/` dan digunakan secara automatik oleh Netlify semasa deployment. Sambungan pangkalan data diurus oleh `@netlify/database`; connection string tidak diperlukan dalam kod.

Untuk perubahan skema pada masa hadapan:

```bash
pnpm db:generate --name add_nama_perubahan
```

Jangan jalankan `drizzle-kit push` atau `drizzle-kit migrate`. Netlify mengurus aplikasi migrasi pada masa deployment.

Migrasi seed menyediakan satu contoh Pencapaian Guru dan satu contoh Pencapaian Sekolah. Kedua-duanya tidak mempunyai dokumen contoh bagi mengelakkan fail palsu dimasukkan ke storan rasmi.

## Netlify Blobs

Store `achievement-files` diwujudkan secara automatik pada penggunaan pertama. Kunci storan hanya disimpan dalam database dan tidak pernah dihantar ke frontend. Semua bacaan fail melalui `/api/files/:id` selepas sesi pentadbir disahkan.

Fail dimuat naik dalam bahagian 2 MB. Backend mengesahkan token muat naik, bilangan bahagian, saiz keseluruhan, MIME type dan sambungan sebelum rekod diaktifkan.

## Menjalankan Secara Tempatan

Prasyarat: Node.js 22 dan pnpm.

```bash
pnpm install
netlify dev --port 8889
```

Gunakan Netlify CLI supaya Functions, Database dan Blobs diemulasikan dalam konteks Netlify. Tetapkan Environment Variables melalui Netlify CLI/UI untuk laman yang dipautkan; jangan dedahkan rahsia dalam frontend.

## Deployment

1. Pautkan repositori kepada laman Netlify.
2. Tetapkan lima Environment Variables yang diperlukan.
3. Pastikan build command ialah `vite build` dan publish directory ialah `dist/client` (sudah ditetapkan dalam `netlify.toml`).
4. Deploy. Netlify memasang migrasi database sebelum aplikasi digunakan.
5. Log masuk sebagai pentadbir, semak data contoh, kemudian uji satu penghantaran guru dengan dokumen sebenar.

## Had ZIP

Untuk kestabilan fungsi, satu proses ZIP dihadkan kepada jumlah fail 40 MB. Jika pilihan terlalu besar, sistem meminta pentadbir mengecilkan pilihan mengikut tahun atau jenis rekod. Struktur ZIP ialah `Tahun/Jenis Pencapaian/Nombor Rujukan/`.

## Keselamatan Operasi

- Tukar kata laluan dan hash secara berkala.
- Gunakan nilai `SESSION_SECRET` yang panjang dan unik.
- Jangan beri akses Environment Variables kepada pengguna biasa.
- Semak audit log terus dalam database apabila siasatan pentadbiran diperlukan.
- Rekod yang dipadam turut memadam fail berkaitan daripada Netlify Blobs.
