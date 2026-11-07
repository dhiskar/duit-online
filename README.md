# Duit Online

Aplikasi pencatatan keuangan pribadi yang menaruh data setiap pengguna di Supabase. Antarmukanya di-host sebagai situs statis di Cloudflare Pages. Versi ini merupakan salinan terpisah dari Duit offline; folder dan data proyek lama tidak diubah.

## Fitur

- Daftar akun, masuk dengan email/kata sandi, verifikasi email, dan pemulihan kata sandi melalui Supabase Auth.
- Data dompet, transaksi, kategori, anggaran, dan pengaturan disimpan pada database Supabase.
- Row Level Security (RLS) membatasi akses setiap akun hanya ke baris datanya sendiri.
- Impor cadangan JSON versi Duit lama, unduh cadangan JSON, dan ekspor laporan CSV.
- Aplikasi dapat dipasang di layar utama. Membuka dan menyimpan data memerlukan internet.

Setiap akun menyimpan satu dokumen JSON di Supabase agar format lama dapat dipertahankan. Cadangan lokal dari versi lama tidak otomatis diimpor; ekspor dari **Pengaturan → Unduh cadangan JSON**, lalu impor setelah masuk ke akun baru.

## 1. Siapkan Supabase

1. Buat proyek di [Supabase](https://supabase.com/).
2. Dari **Project Settings → API**, salin Project URL dan publishable key (atau anon key lama). Keduanya konfigurasi publik untuk browser. **Jangan gunakan `service_role` key.**
3. Buka **SQL Editor**, tempel isi `supabase-setup.sql`, lalu jalankan. Ini membuat tabel `duit_user_data` dan kebijakan RLS.
4. Di **Authentication → URL Configuration**, tambahkan URL Cloudflare Pages sebagai Site URL dan Redirect URL, misalnya `https://duit-online.pages.dev/**`.
5. Di **Authentication → Providers → Email**, aktifkan pendaftaran email. Verifikasi email disarankan; pastikan SMTP/email bawaan Supabase dikonfigurasi untuk pemakaian produksi.

## 2. Atur konfigurasi aplikasi

Edit `supabase-config.js` dan ganti nilai contoh:

```js
window.DUIT_SUPABASE_CONFIG = {
  url: 'https://PROJECT-REF.supabase.co',
  anonKey: 'PUBLISHABLE_OR_ANON_KEY'
};
```

URL dan publishable/anon key memang terlihat di browser. Keamanan data bergantung pada autentikasi dan kebijakan RLS di database. Jangan pernah menaruh kata sandi database atau `service_role` key dalam file yang di-host.

## 3. Deploy ke Cloudflare Pages

Cara paling sederhana, tanpa build:

1. Hubungkan repo GitHub `dhiskar/duit-online` ke Cloudflare Pages melalui **Workers & Pages → Create → Pages → Connect to Git**.
2. Framework preset: **None**; Build command: kosong; Build output directory: `.` (root).
3. Deploy, lalu buka URL `*.pages.dev` dan tambahkan URL itu ke Supabase Redirect URLs.
4. Buat akun, verifikasi email bila diminta, lalu uji tambah data, muat ulang, dan masuk dari perangkat/browser lain.

Setelah repo terhubung, perubahan yang di-push ke GitHub dapat di-deploy otomatis oleh Cloudflare Pages.

`index.html` adalah halaman deploy. `Duit.html` adalah salinan halaman utama. Unggah file pendamping di bawah bersama halaman tersebut.

## 4. File data lama

Di aplikasi Duit lama, buat file melalui **Pengaturan → Unduh cadangan JSON**. Masuk/daftar di Duit Online, lalu pilih **Pengaturan → Pulihkan dari cadangan**. Pemulihan mengganti seluruh data akun online yang sedang aktif; unduh cadangan terlebih dahulu jika akun sudah berisi data.

## 5. Catatan keamanan dan operasional

- Setiap pengguna hanya dapat membaca, menambah, atau mengubah baris yang `user_id`-nya sama dengan ID akun terautentikasi. Jangan menonaktifkan RLS.
- Kata sandi ditangani Supabase Auth; aplikasi tidak menyimpan kata sandi.
- Data keuangan tersimpan pada database Supabase dan dikirim melalui HTTPS. Cadangkan data secara rutin dari Pengaturan.
- Aplikasi memerlukan koneksi untuk membuka data; ketika offline, data tidak ditampilkan atau disimpan ke browser sebagai sumber alternatif.
- Setiap perubahan dikirim ke Supabase. Indikator di bagian atas menunjukkan status sinkronisasi; jika gagal, gunakan indikator itu untuk mencoba lagi.
- Untuk memindahkan akun ke perangkat lain, masuk menggunakan akun yang sama. Setelah login, aplikasi mengambil data dari Supabase. Jika akun yang sama sedang terbuka di beberapa perangkat, gunakan reload untuk mengambil perubahan terbaru; jangan mengedit bersamaan karena pembaruan dokumen terakhir akan menggantikan dokumen sebelumnya.
- File `sw.js` hanya menyimpan kerangka aplikasi; autentikasi, library Supabase, serta data tetap memerlukan internet.

## Struktur

```text
duit-online/
├── index.html             # halaman aplikasi untuk Cloudflare Pages
├── Duit.html              # salinan halaman aplikasi
├── online.js              # login, pemulihan akun, dan sinkronisasi Supabase
├── online.css             # tampilan login dan status sinkronisasi
├── supabase-config.js     # URL + publishable/anon key publik
├── supabase-setup.sql     # tabel dan kebijakan RLS
├── manifest.webmanifest   # identitas PWA
├── sw.js                  # cache kerangka aplikasi
└── ikon PWA
```

Tidak ada build step. Deploy file-file di folder ini sebagai root Cloudflare Pages.
