# 📮 Sistem Informasi Agenda Surat (SIAS) SMA YWKA Bandung
### Versi 2.0 - Dilengkapi No. Agenda Tracker, Google Drive Upload, & 12 Kode Resmi

Aplikasi web modern untuk pengelolaan **Buku Agenda Surat Keluar & Surat Masuk** SMA YWKA Bandung yang terhubung langsung ke [Google Spreadsheet SMA YWKA](https://docs.google.com/spreadsheets/d/1RzsLrm9_FOUUzDjyq60zyGBkrADROCtdrnRGvecST3k/edit?gid=381566345#gid=381566345).

Telah live di: **[sistem-informasi-agenda-surat-ywka.vercel.app](https://sistem-informasi-agenda-surat-ywka.vercel.app/)**

---

## 🌟 Pembaruan Terbaru (Sesuai Permintaan)

1. **Penomoran Mengikuti No. Agenda Surat**:
   - Nomor dihitung berdasarkan **No. Agenda Surat** (Kolom D di spreadsheet).
   - Sistem mendeteksi nomor agenda terakhir yang sudah terisi (misalnya `607`), sehingga nomor berikutnya otomatis siap di **`608`**.
   - Pengguna tetap dapat mengedit nomor jika diperlukan sub-agenda (misal `608.a` atau `608.b`).
   - Format lengkap otomatis: `[Kode]/[No. Agenda]/SMA YWKA/TU/[Bulan Romawi]/[Tahun]`.

2. **Fitur Upload Berkas Scan Surat ke Google Drive**:
   - Tersedia area upload berkas (PDF / Gambar) pada form Surat Keluar dan form Surat Masuk.
   - Terhubung langsung ke folder resmi Google Drive: **[Folder Berkas Surat SMA YWKA](https://drive.google.com/drive/folders/1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A)** (ID: `1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A`).
   - Tautan langsung Google Drive otomatis disimpan di kolom *Lampiran Fisik* Google Spreadsheet.
   - Di tabel web dan header, terdapat tombol langsung **"Folder Drive Surat"** dan **"📄 Berkas Drive"** untuk membuka langsung dokumen PDF/scan tersebut.

3. **12 Kode Klasifikasi Resmi Surat SMA YWKA**:
   - **421.3** = untuk surat umum
   - **421.6** = untuk surat pelepasan / Wisuda
   - **421.7** = Untuk kegiatan siswa
   - **421.71** = untuk Kegiatan Reuni, atau Karya Wisata
   - **422.1** = untuk kegiatan PPDB dan MPLS
   - **422.3** = Untuk Pengumuman Hari Libur
   - **422.5** = Untuk Beasiswa / Pelajar Teladan
   - **423.5** = Untuk kegiatan Kurikulum
   - **423.7** = Untuk Kegiatan PAT, PAS, UTS, atau UJIAN
   - **425.11** = untuk kegiatan Sarana dan Prasarana, dan gedung sekolah
   - **425.2** = untuk kegiatan Sarana dan Prasarana Buku / Bahan Ajar
   - **425.3** = untuk sarana dan prasarana perlengkapan sekolah dan lainnya

4. **Fitur Template Dokumen Kosong (Format Naskah Dinas Resmi)**:
   - Filter kategori chips lama yang tidak terpakai telah dibersihkan agar form lebih ringkas dan fokus.
   - Disediakan tombol **"Template Dokumen Kosong"** yang otomatis menyusun naskah dinas resmi siap pakai sesuai kode surat yang dipilih.
   - Dilengkapi Kop Resmi SMAS YWKA Bandung, nomor agenda otomatis, titi mangsa, dan tanda tangan Kepala Sekolah.
   - Mendukung **🖨️ Cetak / Simpan PDF**, **📋 Salin Teks ke Word**, serta **💾 Unduh File Word (.doc)**.

5. **Dukungan Mobile Android App (PWA & APK Ready)**:
   - Dilengkapi `manifest.json` dan Service Worker (`sw.js`).
   - Dapat diinstal langsung dari browser Chrome di HP Android via tombol **"Install Aplikasi (HP)"**.
   - Berjalan layar penuh (*standalone*), ikon logo resmi YWKA, dan otomatis terupdate saat web Vercel diperbarui.
   - Dapat di-package menjadi file fisik `.apk` melalui [PWABuilder](https://www.pwabuilder.com/).

---

## 📁 Struktur Berkas

```
📁 Project/
├── 📄 index.html              # Halaman antarmuka utama (Dashboard, Generator, Tabel, & Drive Upload)
├── 📄 style.css               # Desain UI modern, responsif, dropzone upload, & print layout
├── 📄 app.js                  # Logika aplikasi, tracking No. Agenda, 12 kode, template kosong, & PWA
├── 📄 manifest.json           # Konfigurasi PWA & Android Mobile App
├── 📄 sw.js                   # Service Worker PWA (Cache & Offline support)
├── 📄 icon-192.png            # Icon PWA 192x192 px
├── 📄 icon-512.png            # Icon PWA 512x512 px
├── 📄 google-apps-script.js   # Skrip backend Google Apps Script v2.0 (Auto-Save + Google Drive Upload)
├── 📄 vercel.json             # Konfigurasi Vercel deployment & PWA headers
└── 📄 README.md               # Dokumentasi lengkap
```

---

## 🔄 Cara Memperbarui Skrip Google Apps Script (Untuk Mengaktifkan Drive Upload)

Agar fitur upload ke Google Drive dan penyimpanan otomatis berjalan:

1. Buka file Google Spreadsheet Anda:  
   👉 [Google Spreadsheet SMA YWKA](https://docs.google.com/spreadsheets/d/1RzsLrm9_FOUUzDjyq60zyGBkrADROCtdrnRGvecST3k/edit?gid=381566345#gid=381566345)
2. Klik menu **Ekstensi (Extensions)** > **Apps Script**.
3. Hapus semua kode lama, ganti dengan seluruh isi file [**`google-apps-script.js`**](file:///d:/New%20Data%20SMA%20YWKA%20(Fierza)/Project/google-apps-script.js).
4. Klik tombol **Simpan** (💾).
5. Klik **Deploy** (kanan atas) > **Manage deployments** (atau **New deployment**).
6. Edit atau buat deployment baru tipe **Web app**:
   - **Execute as**: *Me*
   - **Who has access**: *Anyone*
7. Klik **Deploy**, beri izin Google Drive jika diminta (*Authorize access*).
8. Salin **Web app URL** yang muncul.
9. Buka tab **"Koneksi Spreadsheet"** di aplikasi web, tempelkan URL tersebut, dan klik **Simpan Pengaturan**.

---

## 🚀 Cara Update ke Vercel

Jika repository Anda terhubung ke GitHub:
```bash
git add .
git commit -m "Update No Agenda tracking, 12 kode surat, Google Drive upload, dan template Drive"
git push origin main
```
Vercel akan otomatis melakukan update ke alamat [sistem-informasi-agenda-surat-ywka.vercel.app](https://sistem-informasi-agenda-surat-ywka.vercel.app/) dalam beberapa detik!

---

*Dikembangkan untuk Tata Usaha SMA YWKA Bandung.*
