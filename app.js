/**
 * ===================================================================
 * APLIKASI AGENDA SURAT SMA YWKA BANDUNG
 * app.js - Controller, Drive Upload, 12 Kode Surat & No. Agenda
 * ===================================================================
 */

// Konfigurasi Spreadsheet SMA YWKA
const SPREADSHEET_ID = "1RzsLrm9_FOUUzDjyq60zyGBkrADROCtdrnRGvecST3k";
const GID_SURAT_KELUAR = "381566345";
const GID_SURAT_MASUK = "1925080880";

// URL Endpoint Google Sheets GViz CSV
const URL_CSV_KELUAR = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID_SURAT_KELUAR}`;
const URL_CSV_MASUK = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID_SURAT_MASUK}`;

// State Global Aplikasi
let state = {
  suratKeluar: [],
  suratMasuk: [],
  filteredKeluar: [],
  filteredMasuk: [],
  pagination: {
    keluarPage: 1,
    keluarPerPage: 15,
    masukPage: 1,
    masukPerPage: 15
  },
  appsScriptUrl: localStorage.getItem("sma_ywka_apps_script_url") || "",
  driveKeluarUrl: localStorage.getItem("sma_ywka_drive_keluar_url") || "https://drive.google.com/drive/folders/1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A",
  driveMasukUrl: localStorage.getItem("sma_ywka_drive_masuk_url") || "https://drive.google.com/drive/folders/1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A",
  lastFilledAgendaNumber: "608",
  nextKeluarAgenda: "609",
  isSyncing: false,
  selectedCategory: "all",
  stagedFileKeluar: null,
  stagedFileMasuk: null,
  pendingKeluarData: null,
  pendingMasukData: null
};

// Bulan Romawi Converter
const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

// Koleksi Template Surat Lengkap Berdasarkan Arsip Google Drive SMA YWKA
const REAL_DRIVE_TEMPLATES = [
  // 1. KODE 421.3 - SURAT UMUM
  {
    id: "tpl-umum-mengajar",
    cat: "421.3",
    nama: "Keterangan Aktif Mengajar Guru",
    kode: "421.3",
    perihal: "Surat Keterangan Aktif Mengajar Guru Mata Pelajaran",
    kepada: "Yang Berkepentingan",
    petugas: "BU MIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Surat Keterangan"
  },
  {
    id: "tpl-umum-ijazah",
    cat: "421.3",
    nama: "Surat Pengganti Ijazah / Ralat",
    kode: "421.3",
    perihal: "Surat Keterangan Pengganti Ijazah Rusak / Hilang an. [Nama Siswa]",
    kepada: "Dinas KCD VII",
    petugas: "BU MIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pengganti Ijazah"
  },
  {
    id: "tpl-umum-aktif-siswa",
    cat: "421.3",
    nama: "Keterangan Siswa Aktif",
    kode: "421.3",
    perihal: "Surat Keterangan Siswa Aktif Bersekolah di SMA YWKA a.n [Nama Siswa] [Kelas]",
    kepada: "Yang Berkepentingan",
    petugas: "BU MIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Siswa Aktif"
  },
  {
    id: "tpl-umum-undangan-rapat",
    cat: "421.3",
    nama: "Undangan Rapat Dinas / Walas",
    kode: "421.3",
    perihal: "Surat Undangan Rapat Dinas Persiapan Pembelajaran dan Koordinasi Guru",
    kepada: "Bapak/Ibu Guru & Karyawan",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Undangan Rapat"
  },
  {
    id: "tpl-umum-kelakuan-baik",
    cat: "421.3",
    nama: "Surat Kelakuan Baik",
    kode: "421.3",
    perihal: "Surat Keterangan Kelakuan Baik Siswa a.n [Nama Siswa] [Kelas]",
    kepada: "Yang Membutuhkan",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Kelakuan Baik"
  },
  {
    id: "tpl-umum-dks-yayasan",
    cat: "421.3",
    nama: "Permohonan Pencairan DKS ke Yayasan",
    kode: "421.3",
    perihal: "Surat Permohonan Pencairan Dana DKS ke Yayasan Wanita Kereta Api",
    kepada: "Ketua Pengurus Yayasan Wanita Kereta Api",
    petugas: "BUNDA MELI",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pencairan Dana"
  },
  {
    id: "tpl-umum-gaji-berkala",
    cat: "421.3",
    nama: "Usulan Kenaikan Gaji Berkala",
    kode: "421.3",
    perihal: "Surat Usulan Kenaikan Gaji Berkala Tenaga Pendidik / Tendik a.n [Nama Guru]",
    kepada: "Direktur Pendidikan Yayasan Wanita Kereta Api",
    petugas: "BUNDA WILDA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Kepegawaian"
  },

  // 2. KODE 421.6 - SURAT PELEPASAN / WISUDA
  {
    id: "tpl-wisuda-undangan",
    cat: "421.6",
    nama: "Undangan Pelepasan / Wisuda Siswa",
    kode: "421.6",
    perihal: "Surat Undangan Pelepasan dan Wisuda Siswa Kelas XII Tahun Pelajaran 2025/2026",
    kepada: "Orang Tua / Wali Siswa Kelas XII & Tamu Undangan",
    petugas: "BUNDA SHAMIA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Wisuda Siswa"
  },
  {
    id: "tpl-wisuda-sk",
    cat: "421.6",
    nama: "SK Panitia Pelepasan Kelas XII",
    kode: "421.6",
    perihal: "SK Panitia Pelaksana Kegiatan Pelepasan Siswa Kelas XII SMA YWKA",
    kepada: "Panitia Pelaksana Pelepasan",
    petugas: "BUNDA ELVIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "SK Pelepasan"
  },
  {
    id: "tpl-wisuda-dana",
    cat: "421.6",
    nama: "Permohonan Dana Wisuda & Ijazah",
    kode: "421.6",
    perihal: "Surat Permohonan Pencairan Dana Kegiatan Pelepasan Siswa Kelas XII dan Ijazah",
    kepada: "Yayasan Wanita Kereta Api",
    petugas: "BUNDA MELI",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pelepasan Siswa"
  },

  // 3. KODE 421.7 - KEGIATAN SISWA
  {
    id: "tpl-siswa-dispen-lomba",
    cat: "421.7",
    nama: "Dispensasi Siswa Lomba / Ekskul",
    kode: "421.7",
    perihal: "Surat Dispensasi Siswa Mengikuti Kegiatan Persiapan Lomba [Nama Lomba / Ekskul]",
    kepada: "Bapak/Ibu Guru Mata Pelajaran",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Dispensasi Siswa"
  },
  {
    id: "tpl-siswa-tugas-guru",
    cat: "421.7",
    nama: "Surat Tugas Guru Pembimbing Lomba",
    kode: "421.7",
    perihal: "Surat Tugas Guru Pendamping dan Pembimbing Kegiatan Lomba Siswa (O2SN/FLS2N)",
    kepada: "Guru Pembimbing yang Bersangkutan",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Surat Tugas"
  },
  {
    id: "tpl-siswa-ldks",
    cat: "421.7",
    nama: "Pemberitahuan LDKS ke Orang Tua",
    kode: "421.7",
    perihal: "Surat Pemberitahuan Pelaksanaan Pelatihan Dasar Kepemimpinan Siswa (LDKS)",
    kepada: "Orang Tua / Wali Siswa",
    petugas: "BUNDA ELVIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "LDKS Siswa"
  },
  {
    id: "tpl-siswa-ldks-izin",
    cat: "421.7",
    nama: "Permohonan Tempat LDKS ke Militer",
    kode: "421.7",
    perihal: "Surat Permohonan Penyelenggaraan Latihan Dasar Kepemimpinan Siswa di PUSDIKKAV/PUSDIKJAS",
    kepada: "Komandan PUSDIKKAV / PUSDIKJAS",
    petugas: "BUNDA ELVIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Izin Tempat LDKS"
  },
  {
    id: "tpl-siswa-panggilan-ortu",
    cat: "421.7",
    nama: "Panggilan Orang Tua Siswa (BK)",
    kode: "421.7",
    perihal: "Surat Pemanggilan Orang Tua / Wali Siswa a.n [Nama Siswa] [Kelas]",
    kepada: "Orang Tua / Wali Siswa",
    petugas: "AYAH IRWIN / BK",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pemanggilan BK"
  },
  {
    id: "tpl-siswa-homevisit",
    cat: "421.7",
    nama: "Surat Tugas Home Visit Siswa",
    kode: "421.7",
    perihal: "Surat Tugas Home Visit Siswa a.n [Nama Siswa] [Kelas]",
    kepada: "Guru BK & Wali Kelas",
    petugas: "AYAH IRWIN",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Home Visit"
  },
  {
    id: "tpl-siswa-qurban",
    cat: "421.7",
    nama: "Pemberitahuan Kegiatan Qurban",
    kode: "421.7",
    perihal: "Surat Pemberitahuan Kegiatan Qurban Idul Adha 1447 H (Untuk RT/RW/Ortu)",
    kepada: "Orang Tua Siswa / Warga Lingkungan Sekolah",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pemberitahuan Qurban"
  },

  // 4. KODE 421.71 - REUNI ATAU KARYA WISATA
  {
    id: "tpl-wisata-fieldtrip-kai",
    cat: "421.71",
    nama: "Field Trip ke PT. KAI",
    kode: "421.71",
    perihal: "Surat Permohonan Kunjungan / Field Trip Siswa SMA YWKA ke PT. KAI",
    kepada: "Direksi PT. Kereta Api Indonesia (Persero)",
    petugas: "BUNDA ELVIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Field Trip PT. KAI"
  },
  {
    id: "tpl-wisata-pinjam-bus",
    cat: "421.71",
    nama: "Peminjaman Bus untuk Wisata",
    kode: "421.71",
    perihal: "Surat Permohonan Peminjaman Bis Sekolah untuk Kegiatan Karya Wisata Siswa",
    kepada: "Instansi / Pihak Pengelola Transportasi",
    petugas: "BUNDA ELVIRA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Peminjaman Bus"
  },
  {
    id: "tpl-wisata-reuni",
    cat: "421.71",
    nama: "Koordinasi Reuni Alumni SMA YWKA",
    kode: "421.71",
    perihal: "Surat Pemberitahuan dan Izin Penyelenggaraan Kegiatan Reuni Akbar Alumni SMA YWKA",
    kepada: "Pengurus Ikatan Alumni SMA YWKA",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Reuni Alumni"
  },

  // 5. KODE 422.1 - KEGIATAN PPDB DAN MPLS
  {
    id: "tpl-ppdb-mou-smp",
    cat: "422.1",
    nama: "Surat Tugas MOU SPMB SMPN",
    kode: "422.1",
    perihal: "Surat Tugas MOU SPMB SMPN [Nomor SMP] Bandung",
    kepada: "Kepala SMPN ... Bandung",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "MOU SPMB"
  },
  {
    id: "tpl-ppdb-sosialisasi",
    cat: "422.1",
    nama: "Sosialisasi PPDB ke SMP/MTs",
    kode: "422.1",
    perihal: "Surat Perintah Melaksanakan Sosialisasi dan Edu Expo PPDB ke SMP Mitra",
    kepada: "Tim Sosialisasi PPDB SMA YWKA",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Sosialisasi PPDB"
  },
  {
    id: "tpl-ppdb-sk-mpls",
    cat: "422.1",
    nama: "SK Panitia PPDB & MPLS",
    kode: "422.1",
    perihal: "SK Tim Panitia Penerimaan Peserta Didik Baru (PPDB) dan MPLS Tahun Pelajaran 2026/2027",
    kepada: "Guru & Panitia Pelaksana",
    petugas: "BUNDA ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "SK MPLS"
  },

  // 6. KODE 422.3 - PENGUMUMAN HARI LIBUR
  {
    id: "tpl-libur-ramadhan",
    cat: "422.3",
    nama: "Pengumuman Libur Awal Ramadhan",
    kode: "422.3",
    perihal: "Surat Pemberitahuan Libur Awal Ramadhan 1447 H dan Penyesuaian Jam KBM",
    kepada: "Orang Tua / Wali Siswa & Guru",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Libur Ramadhan"
  },
  {
    id: "tpl-libur-idulfitri",
    cat: "422.3",
    nama: "Surat Edaran Libur Hari Raya Idul Fitri",
    kode: "422.3",
    perihal: "Surat Edaran Libur Hari Raya Idul Fitri 1447 H dan Cuti Bersama Sekolah",
    kepada: "Orang Tua / Wali Siswa",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Libur Idul Fitri"
  },
  {
    id: "tpl-libur-semester",
    cat: "422.3",
    nama: "Pengumuman Libur Akhir Semester",
    kode: "422.3",
    perihal: "Surat Pemberitahuan Libur Akhir Semester dan Jadwal Masuk Pembelajaran Kembali",
    kepada: "Seluruh Siswa dan Orang Tua Siswa",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Libur Semester"
  },

  // 7. KODE 422.5 - BEASISWA / PELAJAR TELADAN
  {
    id: "tpl-beasiswa-eligible",
    cat: "422.5",
    nama: "Surat Siswa Eligible SNBP",
    kode: "422.5",
    perihal: "Surat Penetapan dan Kesediaan Siswa Eligible Pendaftaran SNBP 2026",
    kepada: "Siswa & Orang Tua Kelas XII",
    petugas: "BUNDA AYU",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Siswa Eligible"
  },
  {
    id: "tpl-beasiswa-teladan",
    cat: "422.5",
    nama: "SK Siswa Berprestasi / Teladan",
    kode: "422.5",
    perihal: "SK Siswa Berprestasi dan Penerima Penghargaan Pelajar Teladan SMA YWKA",
    kepada: "Siswa yang Bersangkutan",
    petugas: "AYAH RIDWAN",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Siswa Berprestasi"
  },
  {
    id: "tpl-beasiswa-nilai-tinggi",
    cat: "422.5",
    nama: "Permohonan Beasiswa Nilai Tertinggi",
    kode: "422.5",
    perihal: "Surat Permohonan Beasiswa Peraih Nilai Ijazah Tertinggi Tahun Pelajaran 2025/2026",
    kepada: "Yayasan Wanita Kereta Api",
    petugas: "BUNDA SHAMIA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Beasiswa Siswa"
  },

  // 8. KODE 423.5 - KEGIATAN KURIKULUM
  {
    id: "tpl-kur-skl",
    cat: "423.5",
    nama: "Surat Keterangan Lulus (SKL)",
    kode: "423.5",
    perihal: "Surat Keterangan Lulus (SKL) Sementara Siswa Kelas XII Tahun Ajaran 2025/2026",
    kepada: "Yang Membutuhkan",
    petugas: "BUNDA WILDA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "SKL Siswa"
  },
  {
    id: "tpl-kur-supervisi",
    cat: "423.5",
    nama: "SK Supervisi & Kinerja Guru (PKG)",
    kode: "423.5",
    perihal: "SK Supervisi dan Penilaian Kinerja Guru (PKG) dan Tendik SMA YWKA",
    kepada: "Bapak/Ibu Guru & Tim Penilai",
    petugas: "BUNDA WILDA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Supervisi Guru"
  },
  {
    id: "tpl-kur-riset",
    cat: "423.5",
    nama: "Ujian Sidang Riset / Penelitian Siswa",
    kode: "423.5",
    perihal: "Surat Edaran Pelaksanaan Ujian Sidang Penelitian Kelas 12 Tahun Pelajaran 2026",
    kepada: "Penguji & Siswa Kelas XII",
    petugas: "BUNDA SHAMIA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Sidang Penelitian"
  },
  {
    id: "tpl-kur-transkrip",
    cat: "423.5",
    nama: "Transkrip Nilai Siswa Sementara",
    kode: "423.5",
    perihal: "Surat Keterangan Transkrip Nilai Rapor Siswa untuk Keperluan SNBP / Seleksi PTN",
    kepada: "Perguruan Tinggi Negeri",
    petugas: "BUNDA WILDA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Transkrip Nilai"
  },

  // 9. KODE 423.7 - KEGIATAN PAT, PAS, UTS, UJIAN
  {
    id: "tpl-ujian-asts",
    cat: "423.7",
    nama: "Edaran ASTS (Sumatif Tengah Semester / UTS)",
    kode: "423.7",
    perihal: "Surat Perihal Informasi Pelaksanaan Asesmen Sumatif Tengah Semester (ASTS Gasal/Genap)",
    kepada: "Orang Tua / Wali Siswa",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "ASTS / UTS"
  },
  {
    id: "tpl-ujian-asat-psaj",
    cat: "423.7",
    nama: "Edaran ASAT / PSAJ (PAT/PAS)",
    kode: "423.7",
    perihal: "Surat Edaran Pelaksanaan Asesmen Sumatif Akhir Tahun (ASAT / PSAJ 2026)",
    kepada: "Orang Tua / Wali Peserta Didik",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "PSAJ / ASAT"
  },
  {
    id: "tpl-ujian-rapor",
    cat: "423.7",
    nama: "Undangan Pembagian Hasil Asesmen / Rapor",
    kode: "423.7",
    perihal: "Surat Undangan Orang Tua Pembagian Hasil Asesmen Sumatif / Rapor Siswa",
    kepada: "Orang Tua / Wali Siswa",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pembagian Rapor"
  },

  // 10. KODE 425.11 - SARPRAS & GEDUNG SEKOLAH
  {
    id: "tpl-sarpras-gedung",
    cat: "425.11",
    nama: "Permohonan Perbaikan Kusen / Gedung",
    kode: "425.11",
    perihal: "Surat Permohonan Perbaikan Kusen Jendela dan Sarana Gedung Sekolah",
    kepada: "Pengurus Sarpras Yayasan Wanita Kereta Api",
    petugas: "BU AAM AMALIAH",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Perbaikan Sarpras"
  },
  {
    id: "tpl-sarpras-renovasi",
    cat: "425.11",
    nama: "Laporan Kerusakan & Renovasi Kelas",
    kode: "425.11",
    perihal: "Laporan Kondisi Fisik Bangunan dan Usulan Renovasi Ruang Kelas SMA YWKA",
    kepada: "Yayasan Wanita Kereta Api",
    petugas: "BU AAM AMALIAH",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Renovasi Gedung"
  },

  // 11. KODE 425.2 - SARPRAS BUKU / BAHAN AJAR
  {
    id: "tpl-sarpras-buku",
    cat: "425.2",
    nama: "Pengadaan Buku Pelajaran / Modul",
    kode: "425.2",
    perihal: "Surat Pengajuan Pengadaan Buku Pelajaran dan Bahan Ajar Kurikulum Baru",
    kepada: "Bagian Pengadaan Yayasan Wanita Kereta Api",
    petugas: "BUNDA SHAMIA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Bahan Ajar"
  },
  {
    id: "tpl-sarpras-perpus",
    cat: "425.2",
    nama: "Berita Acara Penerimaan Buku Pustaka",
    kode: "425.2",
    perihal: "Berita Acara Penerimaan Hibah dan Pengadaan Buku Koleksi Perpustakaan Sekolah",
    kepada: "Penerbit / Dinas Perpustakaan",
    petugas: "BUNDA SHAMIA",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Buku Perpustakaan"
  },

  // 12. KODE 425.3 - SARPRAS PERLENGKAPAN SEKOLAH & LAINNYA
  {
    id: "tpl-sarpras-alat",
    cat: "425.3",
    nama: "Pengajuan Alat Olahraga & UKS",
    kode: "425.3",
    perihal: "Surat Pengajuan Pengadaan Alat Olahraga dan Perlengkapan Medis Ruang UKS",
    kepada: "Yayasan Wanita Kereta Api",
    petugas: "BU AAM",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Pengajuan Alat"
  },
  {
    id: "tpl-sarpras-pinjam",
    cat: "425.3",
    nama: "Peminjaman Perlengkapan ke SMP/Mitra",
    kode: "425.3",
    perihal: "Surat Permohonan Peminjaman Barang dan Perlengkapan Acara ke SMP YWKA",
    kepada: "Kepala SMP YWKA Bandung",
    petugas: "BU ADE",
    dari: "Syarif Hasanudin, S.Pd., Gr., M.M.",
    keterangan: "Peminjaman Barang"
  }
];

// ===================================================================
// INISIALISASI HALAMAN
// ===================================================================
document.addEventListener("DOMContentLoaded", () => {
  initDateDefaults();
  initNavigation();
  initTemplateChips();
  initAppsScriptInstructions();
  initFileUploadHandlers();
  initEventListeners();
  updateDriveLinksInUI();
  checkConnectionBanners();
  loadDataFromSpreadsheet();
});

function initDateDefaults() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const formattedToday = `${yyyy}-${mm}-${dd}`;

  const genDateInput = document.getElementById("genTanggalSurat");
  if (genDateInput) genDateInput.value = formattedToday;

  const masukTglInput = document.getElementById("inMasukTglSurat");
  const masukTerimaInput = document.getElementById("inMasukTglDiterima");
  if (masukTglInput) masukTglInput.value = formattedToday;
  if (masukTerimaInput) masukTerimaInput.value = formattedToday;

  updateGeneratedPreview();
}

function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const tabPanes = document.querySelectorAll(".tab-pane");
  const titleElem = document.getElementById("currentSectionTitle");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const targetId = item.getAttribute("data-tab");

      navItems.forEach(n => n.classList.remove("active"));
      tabPanes.forEach(p => p.classList.remove("active"));

      item.classList.add("active");
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add("active");

      if (titleElem) {
        titleElem.textContent = item.querySelector("span")?.textContent || "Agenda Surat";
      }

      const sidebar = document.getElementById("sidebar");
      if (sidebar && window.innerWidth <= 992) {
        sidebar.classList.remove("show");
      }

      if (targetId === "tab-statistik") {
        renderStatistics();
      }
    });
  });

  // Mobile Menu Toggle
  const openSidebarBtn = document.getElementById("openSidebarBtn");
  const closeSidebarBtn = document.getElementById("closeSidebarBtn");
  const sidebar = document.getElementById("sidebar");

  if (openSidebarBtn && sidebar) {
    openSidebarBtn.addEventListener("click", () => sidebar.classList.add("show"));
  }
  if (closeSidebarBtn && sidebar) {
    closeSidebarBtn.addEventListener("click", () => sidebar.classList.remove("show"));
  }

  // Quick Action Buttons
  const btnQuickKeluar = document.getElementById("btnQuickCreateKeluar");
  if (btnQuickKeluar) {
    btnQuickKeluar.addEventListener("click", () => {
      const tabGenBtn = document.querySelector('[data-tab="tab-generator"]');
      if (tabGenBtn) tabGenBtn.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const btnQuickMasuk = document.getElementById("btnQuickCreateMasuk");
  const modalMasuk = document.getElementById("modalSuratMasuk");
  if (btnQuickMasuk && modalMasuk) {
    btnQuickMasuk.addEventListener("click", () => {
      modalMasuk.classList.add("show");
    });
  }

  const btnCloseModalMasuk = document.getElementById("btnCloseModalMasuk");
  const btnCancelModalMasuk = document.getElementById("btnCancelModalMasuk");
  if (btnCloseModalMasuk && modalMasuk) {
    btnCloseModalMasuk.addEventListener("click", () => modalMasuk.classList.remove("show"));
  }
  if (btnCancelModalMasuk && modalMasuk) {
    btnCancelModalMasuk.addEventListener("click", () => modalMasuk.classList.remove("show"));
  }

  // Disposisi Modal Close
  const modalDisp = document.getElementById("modalDisposisi");
  const btnCloseModalDisp = document.getElementById("btnCloseModalDisposisi");
  const btnCloseDisp = document.getElementById("btnCloseDisposisi");
  if (btnCloseModalDisp && modalDisp) {
    btnCloseModalDisp.addEventListener("click", () => modalDisp.classList.remove("show"));
  }
  if (btnCloseDisp && modalDisp) {
    btnCloseDisp.addEventListener("click", () => modalDisp.classList.remove("show"));
  }
  const btnPrintDisposisiDoc = document.getElementById("btnPrintDisposisiDoc");
  if (btnPrintDisposisiDoc) {
    btnPrintDisposisiDoc.addEventListener("click", () => window.print());
  }
}

/**
 * Inisialisasi Kategori dan Template Chips
 */
function initTemplateChips() {
  const container = document.getElementById("templateChipsGrid");
  const filterCount = document.getElementById("tplFilteredCount");
  const pills = document.querySelectorAll(".category-pill");

  function renderChips(catFilter = "all") {
    if (!container) return;
    const filtered = catFilter === "all"
      ? REAL_DRIVE_TEMPLATES
      : REAL_DRIVE_TEMPLATES.filter(t => t.cat === catFilter);

    if (filterCount) {
      filterCount.textContent = `Menampilkan ${filtered.length} template (${catFilter === "all" ? "Semua Kode" : "Kode " + catFilter})`;
    }

    let html = "";
    filtered.forEach((t, index) => {
      html += `
        <button type="button" class="template-chip ${index === 0 && catFilter === "all" ? "active" : ""}" data-id="${t.id}">
          <span class="chip-code">${t.kode}</span>
          <span>${t.nama}</span>
        </button>
      `;
    });
    container.innerHTML = html;

    // Attach click events
    container.querySelectorAll(".template-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        container.querySelectorAll(".template-chip").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const tplId = btn.getAttribute("data-id");
        const tplObj = REAL_DRIVE_TEMPLATES.find(x => x.id === tplId);
        if (tplObj) applyTemplateObject(tplObj);
      });
    });
  }

  pills.forEach(pill => {
    pill.addEventListener("click", () => {
      pills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      const cat = pill.getAttribute("data-cat");
      state.selectedCategory = cat;
      renderChips(cat);
    });
  });

  renderChips("all");
}

function applyTemplateObject(tpl) {
  const selKode = document.getElementById("genKodeKlasifikasi");
  const txtPerihal = document.getElementById("genPerihal");
  const txtKepada = document.getElementById("genKepada");
  const txtPetugas = document.getElementById("genPetugas");
  const txtDari = document.getElementById("genDari");
  const txtKet = document.getElementById("genKeterangan");
  const customGroup = document.getElementById("customKodeGroup");

  if (selKode) {
    selKode.value = tpl.kode;
    if (customGroup) customGroup.style.display = "none";
  }
  if (txtPerihal) txtPerihal.value = tpl.perihal;
  if (txtKepada) txtKepada.value = tpl.kepada;
  if (txtPetugas) txtPetugas.value = tpl.petugas;
  if (txtDari) txtDari.value = tpl.dari;
  if (txtKet) txtKet.value = tpl.keterangan;

  updateGeneratedPreview();
  showToast(`Template "${tpl.nama}" berhasil diterapkan!`, "info");
}

/**
 * Handle File Upload Drag-and-Drop & File Selection
 */
function initFileUploadHandlers() {
  // Surat Keluar Upload
  const fileInputKeluar = document.getElementById("genUploadDriveFile");
  const dropzoneKeluar = document.getElementById("keluarDropzone");
  const contentKeluar = document.getElementById("dropzoneContentKeluar");
  const previewKeluar = document.getElementById("filePreviewKeluar");
  const chipNameKeluar = document.getElementById("fileChipNameKeluar");
  const chipSizeKeluar = document.getElementById("fileChipSizeKeluar");
  const btnRemoveKeluar = document.getElementById("btnRemoveFileKeluar");

  if (fileInputKeluar) {
    fileInputKeluar.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleFileStagedKeluar(file);
    });
  }

  if (btnRemoveKeluar) {
    btnRemoveKeluar.addEventListener("click", (e) => {
      e.stopPropagation();
      state.stagedFileKeluar = null;
      if (fileInputKeluar) fileInputKeluar.value = "";
      if (contentKeluar) contentKeluar.style.display = "flex";
      if (previewKeluar) previewKeluar.style.display = "none";
    });
  }

  function handleFileStagedKeluar(file) {
    state.stagedFileKeluar = file;
    if (chipNameKeluar) chipNameKeluar.textContent = file.name;
    if (chipSizeKeluar) chipSizeKeluar.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    if (contentKeluar) contentKeluar.style.display = "none";
    if (previewKeluar) previewKeluar.style.display = "flex";
    showToast(`Berkas "${file.name}" siap di-upload ke Drive!`, "info");
  }

  // Surat Masuk Upload
  const fileInputMasuk = document.getElementById("inMasukUploadDrive");
  const contentMasuk = document.getElementById("dropzoneContentMasuk");
  const previewMasuk = document.getElementById("filePreviewMasuk");
  const chipNameMasuk = document.getElementById("fileChipNameMasuk");
  const chipSizeMasuk = document.getElementById("fileChipSizeMasuk");
  const btnRemoveMasuk = document.getElementById("btnRemoveFileMasuk");

  if (fileInputMasuk) {
    fileInputMasuk.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        state.stagedFileMasuk = file;
        if (chipNameMasuk) chipNameMasuk.textContent = file.name;
        if (chipSizeMasuk) chipSizeMasuk.textContent = `${(file.size / 1024).toFixed(1)} KB`;
        if (contentMasuk) contentMasuk.style.display = "none";
        if (previewMasuk) previewMasuk.style.display = "flex";
      }
    });
  }

  if (btnRemoveMasuk) {
    btnRemoveMasuk.addEventListener("click", (e) => {
      e.stopPropagation();
      state.stagedFileMasuk = null;
      if (fileInputMasuk) fileInputMasuk.value = "";
      if (contentMasuk) contentMasuk.style.display = "flex";
      if (previewMasuk) previewMasuk.style.display = "none";
    });
  }
}

/**
 * Baca Berkas sebagai Base64
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Str = reader.result.split(",")[1];
      resolve(base64Str);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Tampilkan skrip Google Apps Script v2 di Tab Koneksi
 */
function initAppsScriptInstructions() {
  const codeArea = document.getElementById("appsScriptCodeArea");
  const inputUrl = document.getElementById("inputAppsScriptUrl");
  const inputKeluar = document.getElementById("inputDriveKeluarUrl");
  const inputMasuk = document.getElementById("inputDriveMasukUrl");

  if (inputUrl && state.appsScriptUrl) {
    inputUrl.value = state.appsScriptUrl;
  }
  if (inputKeluar && state.driveKeluarUrl) {
    inputKeluar.value = state.driveKeluarUrl;
  }
  if (inputMasuk && state.driveMasukUrl) {
    inputMasuk.value = state.driveMasukUrl;
  }

  const scriptCode = `/**
 * GOOGLE APPS SCRIPT - SMA YWKA AGENDA SURAT v2.5
 * Tempelkan kode ini di Extensions > Apps Script pada Spreadsheet Anda
 */
const SHEET_SURAT_KELUAR = "SURAT KELUAR 2026";
const SHEET_SURAT_MASUK = "SURAT MASUK 2026";
const FOLDER_DRIVE_ID = "1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A";
const FOLDER_DRIVE_UTAMA = "Arsip Surat SMA YWKA";

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "ping";
  if (action === "get_drive_folders" || action === "setup_folders") {
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      folders: setupDriveFolders()
    })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    message: "Google Apps Script v2.5 SMA YWKA Aktif!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (payload.action === "create_surat_keluar") {
      const sheet = ss.getSheetByName(SHEET_SURAT_KELUAR);
      let driveFileUrl = "";
      if (payload.fileBase64 && payload.fileName) {
        driveFileUrl = uploadFileToGoogleDrive(payload.fileBase64, payload.fileName, payload.fileMime, "Surat Keluar 2026");
      }

      const rawKode = payload.kode_klasifikasi || "421.3";
      const kodePrefix = rawKode.endsWith("/") ? rawKode : rawKode + "/";
      const noAgendaStr = String(payload.no_agenda || payload.nomor_urut || "").trim();
      const rowNoUrut = noAgendaStr || payload.no_urut || "609";
      const bulanRomawi = payload.bulan_romawi || "X";
      const tahunSuffix = payload.tahun ? "/" + payload.tahun.replace("/", "") : "/2026";

      const lastRow = sheet.getLastRow();
      let targetRowIndex = -1;

      if (lastRow >= 4) {
        const totalScan = lastRow - 3;
        const agendaVals = sheet.getRange(4, 4, totalScan, 1).getValues();
        const perihalVals = sheet.getRange(4, 9, totalScan, 1).getValues();
        for (let i = 0; i < agendaVals.length; i++) {
          if (String(agendaVals[i][0]).trim() === noAgendaStr && !String(perihalVals[i][0]).trim()) {
            targetRowIndex = i + 4;
            break;
          }
        }
      }

      const rowData = [
        rowNoUrut,
        true,
        kodePrefix,
        noAgendaStr,
        "/SMA YWKA/TU/",
        bulanRomawi,
        tahunSuffix,
        payload.tanggal_surat || "",
        payload.perihal || "",
        payload.dari || "Syarif Hasanudin, S.Pd., Gr., M.M.",
        payload.kepada || "",
        payload.petugas || "",
        payload.keterangan || "",
        driveFileUrl || "Surat Keluar"
      ];

      if (targetRowIndex > 0) {
        sheet.getRange(targetRowIndex, 1, 1, rowData.length).setValues([rowData]);
      } else {
        sheet.appendRow(rowData);
        targetRowIndex = sheet.getLastRow();
      }
      try { sheet.getRange(targetRowIndex, 1, 1, rowData.length).setBorder(true, true, true, true, true, true); } catch(e){}

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        drive_file_url: driveFileUrl,
        no_agenda: noAgendaStr,
        no_urut: rowNoUrut
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function setupDriveFolders() {
  let main;
  try { main = DriveApp.getFolderById(FOLDER_DRIVE_ID); } catch(e) {
    const f = DriveApp.getFoldersByName(FOLDER_DRIVE_UTAMA);
    main = f.hasNext() ? f.next() : DriveApp.createFolder(FOLDER_DRIVE_UTAMA);
  }
  let k; const ik = main.getFoldersByName("Surat Keluar 2026");
  k = ik.hasNext() ? ik.next() : main.createFolder("Surat Keluar 2026");
  try { k.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}
  return { suratKeluarUrl: k.getUrl(), mainFolderUrl: main.getUrl() };
}

function uploadFileToGoogleDrive(base64Data, fileName, mimeType, subfolder) {
  let main;
  try { main = DriveApp.getFolderById(FOLDER_DRIVE_ID); } catch (e) {
    const folders = DriveApp.getFoldersByName(FOLDER_DRIVE_UTAMA);
    main = folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_DRIVE_UTAMA);
  }
  let target = main;
  if (subfolder) {
    const subs = main.getFoldersByName(subfolder);
    target = subs.hasNext() ? subs.next() : main.createFolder(subfolder);
  }
  const decoded = Utilities.base64Decode(base64Data);
  const file = target.createFile(Utilities.newBlob(decoded, mimeType || "application/pdf", fileName));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}
  return file.getUrl();
}`;

  if (codeArea) codeArea.value = scriptCode;

  const btnCopyScript = document.getElementById("btnCopyScriptCode");
  if (btnCopyScript) {
    btnCopyScript.addEventListener("click", () => {
      navigator.clipboard.writeText(scriptCode);
      showToast("Kode Google Apps Script v2.5 berhasil disalin!", "success");
    });
  }
}

/**
 * Event Listeners
 */
function initEventListeners() {
  const btnRefresh = document.getElementById("btnRefreshData");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => loadDataFromSpreadsheet());
  }

  const genKode = document.getElementById("genKodeKlasifikasi");
  const genCustomKode = document.getElementById("genCustomKode");
  const genNoUrut = document.getElementById("genNomorUrut");
  const genTgl = document.getElementById("genTanggalSurat");
  const genPerihal = document.getElementById("genPerihal");
  const customKodeGroup = document.getElementById("customKodeGroup");

  if (genKode) {
    genKode.addEventListener("change", () => {
      if (genKode.value === "custom") {
        customKodeGroup.style.display = "block";
      } else {
        customKodeGroup.style.display = "none";
      }
      updateGeneratedPreview();
    });
  }

  if (genCustomKode) genCustomKode.addEventListener("input", updateGeneratedPreview);
  if (genNoUrut) genNoUrut.addEventListener("input", updateGeneratedPreview);
  if (genTgl) genTgl.addEventListener("change", updateGeneratedPreview);
  if (genPerihal) genPerihal.addEventListener("input", updateGeneratedPreview);

  // Auto Increment Button (Kembali ke Agenda Berikutnya yang Terdeteksi)
  const btnAutoInc = document.getElementById("btnAutoIncrement");
  if (btnAutoInc) {
    btnAutoInc.addEventListener("click", () => {
      if (genNoUrut) {
        genNoUrut.value = state.nextKeluarAgenda;
        updateGeneratedPreview();
        showToast(`No. Agenda disetel otomatis ke: ${state.nextKeluarAgenda}`, "info");
      }
    });
  }

  // Copy Generated Number
  const btnCopyNumber = document.getElementById("btnCopyGeneratedNumber");
  if (btnCopyNumber) {
    btnCopyNumber.addEventListener("click", () => {
      const previewText = document.getElementById("previewFullNumber")?.textContent || "";
      navigator.clipboard.writeText(previewText);
      showToast(`Nomor berhasil disalin: ${previewText}`, "success");
    });
  }

  // Disposisi Mini Button
  const btnPrintMini = document.getElementById("btnPrintDisposisiMini");
  if (btnPrintMini) {
    btnPrintMini.addEventListener("click", () => {
      const fullNumber = document.getElementById("previewFullNumber")?.textContent || "";
      const perihal = document.getElementById("genPerihal")?.value || "-";
      const kepada = document.getElementById("genKepada")?.value || "-";
      const tgl = document.getElementById("genTanggalSurat")?.value || "-";
      const petugas = document.getElementById("genPetugas")?.value || "-";
      const dari = document.getElementById("genDari")?.value || "Syarif Hasanudin, S.Pd., Gr., M.M.";

      openDisposisiModal({
        tipe: "Surat Keluar",
        noUrut: document.getElementById("genNomorUrut")?.value || state.nextKeluarAgenda,
        noLengkap: fullNumber,
        tanggal: tgl,
        perihal: perihal,
        kepada: kepada,
        dari: dari,
        petugas: petugas
      });
    });
  }

  // Form Generator Submit
  const formKeluar = document.getElementById("formGeneratorSurat");
  if (formKeluar) {
    formKeluar.addEventListener("submit", handleCreateSuratKeluar);
  }

  // Form Surat Masuk Submit
  const formMasuk = document.getElementById("formInputSuratMasuk");
  if (formMasuk) {
    formMasuk.addEventListener("submit", handleCreateSuratMasuk);
  }

  // Search & Filter Surat Keluar
  const searchKeluar = document.getElementById("searchKeluarInput");
  const filterKeluarKlas = document.getElementById("filterKeluarKlasifikasi");
  const filterKeluarBulan = document.getElementById("filterKeluarBulan");
  const btnClearSearchKeluar = document.getElementById("btnClearSearchKeluar");

  if (searchKeluar) {
    searchKeluar.addEventListener("input", () => {
      if (btnClearSearchKeluar) {
        btnClearSearchKeluar.style.display = searchKeluar.value ? "block" : "none";
      }
      filterSuratKeluarData();
    });
  }
  if (btnClearSearchKeluar && searchKeluar) {
    btnClearSearchKeluar.addEventListener("click", () => {
      searchKeluar.value = "";
      btnClearSearchKeluar.style.display = "none";
      filterSuratKeluarData();
    });
  }
  if (filterKeluarKlas) filterKeluarKlas.addEventListener("change", filterSuratKeluarData);
  if (filterKeluarBulan) filterKeluarBulan.addEventListener("change", filterSuratKeluarData);

  // Search & Filter Surat Masuk
  const searchMasuk = document.getElementById("searchMasukInput");
  const filterMasukPengirim = document.getElementById("filterMasukPengirim");
  const btnClearSearchMasuk = document.getElementById("btnClearSearchMasuk");

  if (searchMasuk) {
    searchMasuk.addEventListener("input", () => {
      if (btnClearSearchMasuk) {
        btnClearSearchMasuk.style.display = searchMasuk.value ? "block" : "none";
      }
      filterSuratMasukData();
    });
  }
  if (btnClearSearchMasuk && searchMasuk) {
    btnClearSearchMasuk.addEventListener("click", () => {
      searchMasuk.value = "";
      btnClearSearchMasuk.style.display = "none";
      filterSuratMasukData();
    });
  }
  if (filterMasukPengirim) filterMasukPengirim.addEventListener("change", filterSuratMasukData);

  // Export CSV
  const btnExportKeluar = document.getElementById("btnExportKeluarCsv");
  if (btnExportKeluar) {
    btnExportKeluar.addEventListener("click", () => exportToCsv(state.suratKeluar, "Agenda_Surat_Keluar_2026_SMA_YWKA.csv"));
  }
  const btnExportMasuk = document.getElementById("btnExportMasukCsv");
  if (btnExportMasuk) {
    btnExportMasuk.addEventListener("click", () => exportToCsv(state.suratMasuk, "Agenda_Surat_Masuk_2026_SMA_YWKA.csv"));
  }

  // Koneksi Settings
  const btnSaveConn = document.getElementById("btnSaveConnectionSettings");
  const inputAppsScript = document.getElementById("inputAppsScriptUrl");
  const inputDriveKeluar = document.getElementById("inputDriveKeluarUrl");
  const inputDriveMasuk = document.getElementById("inputDriveMasukUrl");

  if (btnSaveConn) {
    btnSaveConn.addEventListener("click", () => {
      if (inputAppsScript) {
        state.appsScriptUrl = inputAppsScript.value.trim();
        localStorage.setItem("sma_ywka_apps_script_url", state.appsScriptUrl);
      }
      if (inputDriveKeluar) {
        state.driveKeluarUrl = inputDriveKeluar.value.trim() || "https://drive.google.com/drive/folders/1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A";
        localStorage.setItem("sma_ywka_drive_keluar_url", state.driveKeluarUrl);
      }
      if (inputDriveMasuk) {
        state.driveMasukUrl = inputDriveMasuk.value.trim() || "https://drive.google.com/drive/folders/1e3YGwqV7cK0f7LVGyyxClgC7hTtVEL8A";
        localStorage.setItem("sma_ywka_drive_masuk_url", state.driveMasukUrl);
      }

      updateDriveLinksInUI();
      checkConnectionBanners();
      showToast("Pengaturan koneksi berhasil disimpan!", "success");
      updateConnectionStatus(true, "Tersambung Google Sheets & Drive");
    });
  }

  const btnTestConn = document.getElementById("btnTestConnection");
  if (btnTestConn && inputAppsScript) {
    btnTestConn.addEventListener("click", async () => {
      const url = inputAppsScript.value.trim();
      if (!url) {
        showToast("Masukkan URL Web App terlebih dahulu!", "warning");
        return;
      }
      try {
        btnTestConn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menguji...`;
        const res = await fetch(url + (url.includes("?") ? "&" : "?") + "action=ping");
        const json = await res.json();
        showToast("✅ Koneksi Apps Script Sukses: " + (json.message || "OK"), "success");
      } catch (err) {
        showToast("⚠️ Uji koneksi terkirim. Jika gagal, pastikan Apps Script dideploy sebagai Web app dengan akses 'Anyone'.", "info");
      } finally {
        btnTestConn.innerHTML = `<i class="fa-solid fa-plug-circle-check"></i> Uji Koneksi`;
      }
    });
  }

  // Modal Prompt Apps Script Handlers
  const modalPrompt = document.getElementById("modalAppsScriptPrompt");
  const btnClosePrompt = document.getElementById("btnCloseModalPrompt");
  const btnPromptLocal = document.getElementById("btnSavePromptLocalOnly");
  const btnPromptSync = document.getElementById("btnSavePromptAndSync");
  const promptInput = document.getElementById("promptAppsScriptUrlInput");

  if (btnClosePrompt && modalPrompt) {
    btnClosePrompt.addEventListener("click", () => modalPrompt.classList.remove("show"));
  }

  if (btnPromptLocal && modalPrompt) {
    btnPromptLocal.addEventListener("click", () => {
      modalPrompt.classList.remove("show");
      if (state.pendingKeluarData) {
        const { payload, newItem, origBtnContent } = state.pendingKeluarData;
        executeSaveSuratKeluar(payload, newItem, origBtnContent);
        state.pendingKeluarData = null;
      }
    });
  }

  if (btnPromptSync && modalPrompt && promptInput) {
    btnPromptSync.addEventListener("click", () => {
      const url = promptInput.value.trim();
      if (!url) {
        showToast("Harap masukkan URL Web App Google Apps Script Anda!", "warning");
        return;
      }
      state.appsScriptUrl = url;
      localStorage.setItem("sma_ywka_apps_script_url", url);
      if (inputAppsScript) inputAppsScript.value = url;
      updateConnectionStatus(true, "Tersambung Google Sheets & Drive");
      checkConnectionBanners();
      modalPrompt.classList.remove("show");

      if (state.pendingKeluarData) {
        const { payload, newItem, origBtnContent } = state.pendingKeluarData;
        executeSaveSuratKeluar(payload, newItem, origBtnContent);
        state.pendingKeluarData = null;
      }
    });
  }

  const linkGoToKoneksi = document.getElementById("linkGoToKoneksi");
  if (linkGoToKoneksi) {
    linkGoToKoneksi.addEventListener("click", () => {
      const tabKoneksiBtn = document.querySelector('[data-tab="tab-koneksi"]');
      if (tabKoneksiBtn) tabKoneksiBtn.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
}

/**
 * Hitung dan perbarui preview nomor agenda lengkap
 */
function updateGeneratedPreview() {
  const selKode = document.getElementById("genKodeKlasifikasi");
  const customKode = document.getElementById("genCustomKode");
  const txtNoAgenda = document.getElementById("genNomorUrut");
  const dtTgl = document.getElementById("genTanggalSurat");
  const previewBox = document.getElementById("previewFullNumber");

  let kode = selKode?.value || "421.3";
  if (kode === "custom") {
    kode = customKode?.value.trim() || "421.x";
  }

  let noAgenda = txtNoAgenda?.value.trim() || state.nextKeluarAgenda || "609";

  let romanMonth = "X";
  let tahun = "2026";

  if (dtTgl && dtTgl.value) {
    const parts = dtTgl.value.split("-");
    if (parts.length === 3) {
      tahun = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        romanMonth = ROMAN_MONTHS[monthIdx];
      }
    }
  }

  const fullGeneratedNumber = `${kode}/${noAgenda}/SMA YWKA/TU/${romanMonth}/${tahun}`.replace(/\/{2,}/g, "/");
  if (previewBox) {
    previewBox.textContent = fullGeneratedNumber;
  }
}

/**
 * Muat Data dari Google Spreadsheet
 */
async function loadDataFromSpreadsheet() {
  setLoadingState(true);
  updateConnectionStatus(false, "Menghubungkan ke Spreadsheet...");

  try {
    // 1. Ambil data Surat Keluar 2026
    const resKeluar = await fetch(URL_CSV_KELUAR);
    if (!resKeluar.ok) throw new Error("Gagal mengambil Surat Keluar");
    const csvKeluarText = await resKeluar.text();
    state.suratKeluar = parseCsvKeluar(csvKeluarText);

    // 2. Ambil data Surat Masuk 2026
    const resMasuk = await fetch(URL_CSV_MASUK);
    if (!resMasuk.ok) throw new Error("Gagal mengambil Surat Masuk");
    const csvMasukText = await resMasuk.text();
    state.suratMasuk = parseCsvMasuk(csvMasukText);

    // 3. Pertahankan surat lokal yang belum tersimpan ke Google Sheets agar TIDAK HILANG saat sinkron
    const unsyncedKeluar = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");
    if (unsyncedKeluar.length > 0) {
      unsyncedKeluar.forEach(uItem => {
        const found = state.suratKeluar.some(k => k.noAgenda === uItem.noAgenda && k.perihal === uItem.perihal);
        if (!found) {
          state.suratKeluar.unshift(uItem);
        }
      });
    }

    const unsyncedMasuk = JSON.parse(localStorage.getItem("unsynced_surat_masuk") || "[]");
    if (unsyncedMasuk.length > 0) {
      unsyncedMasuk.forEach(uItem => {
        const found = state.suratMasuk.some(m => m.noAgenda === uItem.noAgenda && m.perihal === uItem.perihal);
        if (!found) {
          state.suratMasuk.unshift(uItem);
        }
      });
    }

    calculateNextSequence();

    localStorage.setItem("cache_surat_keluar_2026", JSON.stringify(state.suratKeluar));
    localStorage.setItem("cache_surat_masuk_2026", JSON.stringify(state.suratMasuk));

    updateConnectionStatus(true, "Terhubung ke Google Sheets & Drive");
    showToast("Data agenda surat 2026 berhasil dimuat secara live!", "success");
  } catch (err) {
    console.warn("Menggunakan data cache SMA YWKA:", err);
    const cachedKeluar = localStorage.getItem("cache_surat_keluar_2026");
    const cachedMasuk = localStorage.getItem("cache_surat_masuk_2026");

    if (cachedKeluar && cachedMasuk) {
      state.suratKeluar = JSON.parse(cachedKeluar);
      state.suratMasuk = JSON.parse(cachedMasuk);
    } else {
      loadBuiltinSampleData();
    }
    calculateNextSequence();
    updateConnectionStatus(true, "Mode Offline / Tersinkron Lokal");
  } finally {
    setLoadingState(false);
    updateDashboardUI();
    filterSuratKeluarData();
    filterSuratMasukData();
    checkConnectionBanners();
    updateDriveLinksInUI();
  }
}

/**
 * Parse CSV Surat Keluar: No. Urut Mengikuti No. Agenda (Col D)
 */
function parseCsvKeluar(csvText) {
  const rows = parseCsvRows(csvText);
  const items = [];

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 8) continue;

    // Abaikan header
    if (r[0] === "NO. URUT" || r[0] === "BUKU AGENDA SURAT KELUAR") continue;

    const noAgenda = (r[3] || "").trim();
    const perihal = (r[8] || "").trim();

    // HANYA ambil baris yang benar-benar memiliki perihal (surat yang sudah diterbitkan)
    // Baris template kosong 609-625 yang perihalnya masih kosong diabaikan agar tidak mengacaukan nomor terakhir
    if (!perihal) continue;

    // No. Urut mengikuti No. Agenda sesuai permintaan pengguna!
    const noUrut = noAgenda || (r[0] || "").trim();
    const kodePrefix = (r[2] || "").trim();
    const sekolahTag = (r[4] || "").trim();
    const bulanRomawi = (r[5] || "").trim();
    const tahun = (r[6] || "").trim();
    const lampiranVal = (r[13] || "").trim();

    let nomorLengkap = "";
    if (kodePrefix && noAgenda) {
      nomorLengkap = `${kodePrefix}${noAgenda}${sekolahTag}${bulanRomawi}${tahun}`.replace(/\/{2,}/g, "/");
    } else if (noAgenda) {
      nomorLengkap = `${noAgenda}/SMA YWKA/TU/${bulanRomawi || 'X'}/${tahun || '2026'}`;
    }

    items.push({
      id: "K-" + (i + 1),
      noUrut: noUrut, // No. Urut mengikuti No. Agenda
      status: r[1] === "TRUE",
      kodeKlasifikasi: kodePrefix.replace("/", "").trim() || "421.3",
      noAgenda: noAgenda,
      nomorLengkap: nomorLengkap,
      bulanRomawi: bulanRomawi,
      tanggal: (r[7] || "").trim(),
      perihal: perihal,
      dari: (r[9] || "Syarif Hasanudin, S.Pd., Gr., M.M.").trim(),
      kepada: (r[10] || "").trim(),
      petugas: (r[11] || "").trim(),
      keterangan: (r[12] || "").trim(),
      lampiran: lampiranVal || "Surat Keluar",
      driveUrl: lampiranVal.includes("drive.google.com") ? lampiranVal : ""
    });
  }

  return items;
}

/**
 * Parse CSV Surat Masuk
 */
function parseCsvMasuk(csvText) {
  const rows = parseCsvRows(csvText);
  const items = [];

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 5) continue;
    if (r[0] === "NO. URUT" || r[0] === "BUKU AGENDA SURAT MASUK") continue;

    const perihal = (r[4] || "").trim();
    const noAgenda = (r[1] || "").trim();
    const lampiranVal = (r[9] || "").trim();

    if (!perihal && !noAgenda) continue;

    items.push({
      id: "M-" + (i + 1),
      noUrut: (r[0] || String(items.length + 1)).trim(),
      noAgenda: noAgenda || "-",
      tglSurat: (r[2] || "").trim(),
      tglMasuk: (r[3] || "").trim(),
      perihal: perihal,
      dari: (r[5] || "").trim(),
      kepada: (r[6] || "SMA YWKA").trim(),
      kodeKlasifikasi: (r[7] || "").trim(),
      keterangan: (r[8] || "").trim(),
      lampiran: lampiranVal || "Surat Masuk",
      driveUrl: lampiranVal.includes("drive.google.com") ? lampiranVal : ""
    });
  }

  return items;
}

function parseCsvRows(text) {
  const p = [];
  let row = [''];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') { i++; }
      p.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    p.push(row);
  }
  return p;
}

/**
 * Hitung No. Agenda Berikutnya: Terakhir 608 (Dispensasi CKG Puskesmas), Berikutnya 609
 */
function calculateNextSequence() {
  let maxFilledAgenda = 0;

  state.suratKeluar.forEach(item => {
    // Ambil angka jika perihalnya ada (artinya surat riil yang sudah terbit)
    if (item.perihal && item.noAgenda) {
      const match = item.noAgenda.match(/^(\d+)/);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val > maxFilledAgenda) maxFilledAgenda = val;
      }
    }
  });

  // Nomor agenda terakhir yang tercatat di berkas riil adalah 608
  // (Surat Dispensasi untuk Siswa yang menjadi Petugas CKG bersama UPTD Puskesmas Garuda)
  if (maxFilledAgenda < 608) {
    maxFilledAgenda = 608;
  }

  state.lastFilledAgendaNumber = String(maxFilledAgenda);
  state.nextKeluarAgenda = String(maxFilledAgenda + 1);

  const inputNoAgenda = document.getElementById("genNomorUrut");
  const nextPreview = document.getElementById("nextNumberPreview");
  const topLastNumber = document.getElementById("topLastNumber");
  const statLastNumber = document.getElementById("statKeluarLastNumber");
  const statNextBadge = document.getElementById("statNextBadge");

  if (inputNoAgenda) {
    inputNoAgenda.value = state.nextKeluarAgenda;
  }
  if (nextPreview) nextPreview.textContent = state.nextKeluarAgenda;
  if (topLastNumber) topLastNumber.textContent = state.lastFilledAgendaNumber;
  if (statLastNumber) statLastNumber.textContent = state.lastFilledAgendaNumber;
  if (statNextBadge) statNextBadge.textContent = state.nextKeluarAgenda;

  updateGeneratedPreview();
}

/**
 * Filter dan Render Tabel Surat Keluar
 */
function filterSuratKeluarData() {
  const search = (document.getElementById("searchKeluarInput")?.value || "").toLowerCase();
  const filterKlas = document.getElementById("filterKeluarKlasifikasi")?.value || "";
  const filterBulan = document.getElementById("filterKeluarBulan")?.value || "";

  state.filteredKeluar = state.suratKeluar.filter(item => {
    const matchSearch = !search ||
      item.noAgenda.toLowerCase().includes(search) ||
      item.nomorLengkap.toLowerCase().includes(search) ||
      item.perihal.toLowerCase().includes(search) ||
      item.kepada.toLowerCase().includes(search) ||
      item.petugas.toLowerCase().includes(search) ||
      item.dari.toLowerCase().includes(search);

    const matchKlas = !filterKlas || item.kodeKlasifikasi.includes(filterKlas);

    let matchBulan = true;
    if (filterBulan) {
      const targetRoman = ROMAN_MONTHS[parseInt(filterBulan, 10) - 1];
      matchBulan = item.bulanRomawi === targetRoman ||
                   item.tanggal.startsWith(filterBulan + "/") ||
                   item.tanggal.includes("/" + filterBulan + "/");
    }

    return matchSearch && matchKlas && matchBulan;
  });

  state.pagination.keluarPage = 1;
  renderSuratKeluarTable();
}

/**
 * Render Tabel Surat Keluar (Ada Kolom No. Agenda & Kolom Google Drive)
 */
function renderSuratKeluarTable() {
  const tbody = document.getElementById("tbodySuratKeluar");
  const infoText = document.getElementById("keluarPaginationInfo");
  const btnContainer = document.getElementById("keluarPaginationBtns");

  if (!tbody) return;

  const total = state.filteredKeluar.length;
  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="loading-state">
          <i class="fa-solid fa-folder-open" style="font-size: 32px; color: #94a3b8; margin-bottom: 8px;"></i>
          <p>Tidak ditemukan surat keluar yang sesuai.</p>
        </td>
      </tr>
    `;
    if (infoText) infoText.textContent = "Menampilkan 0 dari 0 surat";
    if (btnContainer) btnContainer.innerHTML = "";
    return;
  }

  const page = state.pagination.keluarPage;
  const perPage = state.pagination.keluarPerPage;
  const totalPages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, total);

  const currentSlice = state.filteredKeluar.slice(start, end);

  let html = "";
  currentSlice.forEach((item, idx) => {
    const rowNum = start + idx + 1;
    const driveLinkHtml = (item.driveUrl || item.lampiran.includes("http"))
      ? `<a href="${item.driveUrl || item.lampiran}" target="_blank" rel="noopener noreferrer" class="btn-drive-link">
           <i class="fa-brands fa-google-drive"></i> Berkas Drive
         </a>`
      : `<span class="text-light" style="font-size: 11px;">Surat Keluar</span>`;

    html += `
      <tr>
        <td><span class="nomor-agenda-badge"><strong>${escapeHtml(item.noAgenda || item.noUrut || "-")}</strong></span></td>
        <td>
          ${item.isUnsynced
            ? `<span class="badge-unsynced" title="Tersimpan di browser lokal, belum tersinkron ke Google Sheets"><i class="fa-solid fa-clock"></i> Belum Sync</span>`
            : `<span class="status-badge ${item.status ? 'status-active' : 'status-pending'}">${item.status ? 'Resmi' : 'Draft'}</span>`
          }
        </td>
        <td>
          <span class="nomor-surat-badge">${escapeHtml(item.nomorLengkap || "-")}</span>
        </td>
        <td><span class="date-text">${escapeHtml(item.tanggal || "-")}</span></td>
        <td>
          <div class="perihal-cell">${escapeHtml(item.perihal || "-")}</div>
        </td>
        <td><span class="kepada-cell">${escapeHtml(item.kepada || "-")}</span></td>
        <td>
          ${item.petugas ? `<span class="tag-pic">${escapeHtml(item.petugas)}</span>` : `<span class="text-light">-</span>`}
        </td>
        <td style="text-align: center;">${driveLinkHtml}</td>
        <td style="text-align: center;">
          <div class="action-buttons">
            <button type="button" class="btn-table-action" title="Salin Nomor Surat" onclick="copyText('${escapeQuotes(item.nomorLengkap)}')">
              <i class="fa-solid fa-copy"></i>
            </button>
            <button type="button" class="btn-table-action" title="Lihat Lembar Agenda" onclick="viewDisposisiKeluar('${item.id}')">
              <i class="fa-solid fa-file-invoice"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  if (infoText) {
    infoText.textContent = `Menampilkan ${start + 1} - ${end} dari ${total} surat keluar`;
  }

  if (btnContainer) {
    let btnsHtml = "";
    btnsHtml += `<button class="pagination-btn" ${page <= 1 ? "disabled" : ""} onclick="changeKeluarPage(${page - 1})"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
        btnsHtml += `<button class="pagination-btn ${p === page ? "active" : ""}" onclick="changeKeluarPage(${p})">${p}</button>`;
      } else if (p === page - 2 || p === page + 2) {
        btnsHtml += `<span style="padding: 0 4px; color: #94a3b8;">...</span>`;
      }
    }

    btnsHtml += `<button class="pagination-btn" ${page >= totalPages ? "disabled" : ""} onclick="changeKeluarPage(${page + 1})"><i class="fa-solid fa-chevron-right"></i></button>`;
    btnContainer.innerHTML = btnsHtml;
  }
}

/**
 * Filter & Render Tabel Surat Masuk
 */
function filterSuratMasukData() {
  const search = (document.getElementById("searchMasukInput")?.value || "").toLowerCase();
  const filterPengirim = document.getElementById("filterMasukPengirim")?.value || "";

  state.filteredMasuk = state.suratMasuk.filter(item => {
    const matchSearch = !search ||
      item.noAgenda.toLowerCase().includes(search) ||
      item.perihal.toLowerCase().includes(search) ||
      item.dari.toLowerCase().includes(search) ||
      item.keterangan.toLowerCase().includes(search);

    const matchPengirim = !filterPengirim || item.dari.toUpperCase().includes(filterPengirim);

    return matchSearch && matchPengirim;
  });

  state.pagination.masukPage = 1;
  renderSuratMasukTable();
}

/**
 * Render Tabel Surat Masuk
 */
function renderSuratMasukTable() {
  const tbody = document.getElementById("tbodySuratMasuk");
  const infoText = document.getElementById("masukPaginationInfo");
  const btnContainer = document.getElementById("masukPaginationBtns");

  if (!tbody) return;

  const total = state.filteredMasuk.length;
  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="loading-state">
          <i class="fa-solid fa-inbox" style="font-size: 32px; color: #94a3b8; margin-bottom: 8px;"></i>
          <p>Tidak ada surat masuk yang sesuai filter.</p>
        </td>
      </tr>
    `;
    if (infoText) infoText.textContent = "Menampilkan 0 dari 0 surat";
    if (btnContainer) btnContainer.innerHTML = "";
    return;
  }

  const page = state.pagination.masukPage;
  const perPage = state.pagination.masukPerPage;
  const totalPages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, total);

  const currentSlice = state.filteredMasuk.slice(start, end);

  let html = "";
  currentSlice.forEach((item, idx) => {
    const rowNum = start + idx + 1;
    const driveLinkHtml = (item.driveUrl || item.lampiran.includes("http"))
      ? `<a href="${item.driveUrl || item.lampiran}" target="_blank" rel="noopener noreferrer" class="btn-drive-link">
           <i class="fa-brands fa-google-drive"></i> Berkas Drive
         </a>`
      : `<span class="text-light" style="font-size: 11px;">Surat Masuk</span>`;

    html += `
      <tr>
        <td><strong>${item.noUrut || rowNum}</strong></td>
        <td>
          <span class="nomor-surat-badge" style="background: #e0f2fe; color: #0369a1;">${escapeHtml(item.noAgenda)}</span>
        </td>
        <td><span class="date-text">${escapeHtml(item.tglSurat || "-")}</span></td>
        <td><span class="date-text">${escapeHtml(item.tglMasuk || "-")}</span></td>
        <td><div class="perihal-cell">${escapeHtml(item.perihal)}</div></td>
        <td><strong style="color: #334155; font-size: 12.5px;">${escapeHtml(item.dari || "-")}</strong></td>
        <td>${item.keterangan ? `<span class="tag-pic">${escapeHtml(item.keterangan)}</span>` : "-"}</td>
        <td style="text-align: center;">${driveLinkHtml}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-table-action" title="Lihat Lembar Disposisi Masuk" onclick="viewDisposisiMasuk('${item.id}')">
            <i class="fa-solid fa-file-invoice"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  if (infoText) {
    infoText.textContent = `Menampilkan ${start + 1} - ${end} dari ${total} surat masuk`;
  }

  if (btnContainer) {
    let btnsHtml = "";
    btnsHtml += `<button class="pagination-btn" ${page <= 1 ? "disabled" : ""} onclick="changeMasukPage(${page - 1})"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
        btnsHtml += `<button class="pagination-btn ${p === page ? "active" : ""}" onclick="changeMasukPage(${p})">${p}</button>`;
      } else if (p === page - 2 || p === page + 2) {
        btnsHtml += `<span style="padding: 0 4px; color: #94a3b8;">...</span>`;
      }
    }

    btnsHtml += `<button class="pagination-btn" ${page >= totalPages ? "disabled" : ""} onclick="changeMasukPage(${page + 1})"><i class="fa-solid fa-chevron-right"></i></button>`;
    btnContainer.innerHTML = btnsHtml;
  }
}

/**
 * Update Dashboard Header Counters & Stat Cards
 */
function updateDashboardUI() {
  const countKeluar = state.suratKeluar.length;
  const countMasuk = state.suratMasuk.length;

  const keluarBadge = document.getElementById("countKeluarBadge");
  const masukBadge = document.getElementById("countMasukBadge");
  const statKeluarTotal = document.getElementById("statKeluarTotal");
  const statMasukTotal = document.getElementById("statMasukTotal");

  if (keluarBadge) keluarBadge.textContent = countKeluar;
  if (masukBadge) masukBadge.textContent = countMasuk;
  if (statKeluarTotal) statKeluarTotal.textContent = countKeluar;
  if (statMasukTotal) statMasukTotal.textContent = countMasuk;

  const currentMonthIdx = new Date().getMonth() + 1;
  const currentRoman = ROMAN_MONTHS[currentMonthIdx - 1];
  const bulanIniCount = state.suratKeluar.filter(s => s.bulanRomawi === currentRoman).length;
  const statBulanIni = document.getElementById("statKeluarBulanIni");
  const statBulanLabel = document.getElementById("statKeluarBulanLabel");

  if (statBulanIni) statBulanIni.textContent = bulanIniCount;
  if (statBulanLabel) statBulanLabel.textContent = `Bulan ${MONTH_NAMES[currentMonthIdx - 1]} 2026`;

  const yayasanCount = state.suratMasuk.filter(m => m.dari.toUpperCase().includes("YAYASAN")).length;
  const statYayasan = document.getElementById("statMasukYayasanCount");
  if (statYayasan) statYayasan.textContent = yayasanCount;

  if (state.suratMasuk.length > 0) {
    const lastM = state.suratMasuk[state.suratMasuk.length - 1];
    const statMLastNo = document.getElementById("statMasukLastNumber");
    const statMLastDate = document.getElementById("statMasukLastDate");
    if (statMLastNo) statMLastNo.textContent = lastM.noAgenda ? lastM.noAgenda.substring(0, 18) + "..." : "-";
    if (statMLastDate) statMLastDate.textContent = lastM.tglMasuk || lastM.tglSurat || "-";
  }
}

/**
 * Update semua link Google Drive di UI agar membuka folder yang sesuai
 */
function updateDriveLinksInUI() {
  const keluarLinks = [
    document.getElementById("btnHeaderDriveKeluar"),
    document.getElementById("topNavDriveKeluarBtn"),
    document.getElementById("navDriveMainLink"),
    document.getElementById("btnTestOpenDriveKeluar")
  ];
  keluarLinks.forEach(el => {
    if (el && state.driveKeluarUrl) {
      el.href = state.driveKeluarUrl;
    }
  });

  const masukLinks = [
    document.getElementById("btnHeaderDriveMasuk"),
    document.getElementById("btnTestOpenDriveMasuk")
  ];
  masukLinks.forEach(el => {
    if (el && state.driveMasukUrl) {
      el.href = state.driveMasukUrl;
    }
  });
}

/**
 * Tampilkan / sembunyikan banner status Google Apps Script di tab Generator
 */
function checkConnectionBanners() {
  const bannerWarning = document.getElementById("bannerConnWarning");
  const bannerSuccess = document.getElementById("bannerConnSuccess");

  if (state.appsScriptUrl) {
    if (bannerWarning) bannerWarning.style.display = "none";
    if (bannerSuccess) bannerSuccess.style.display = "flex";
  } else {
    if (bannerWarning) bannerWarning.style.display = "flex";
    if (bannerSuccess) bannerSuccess.style.display = "none";
  }
}

/**
 * Handle Penyimpanan Surat Keluar Baru (Termasuk File Upload ke Google Drive)
 */
async function handleCreateSuratKeluar(e) {
  e.preventDefault();

  const btnSubmit = document.getElementById("btnSubmitToSheets");
  const origBtnContent = btnSubmit.innerHTML;
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan & Mengunggah...`;

  const selKode = document.getElementById("genKodeKlasifikasi");
  const customKode = document.getElementById("genCustomKode");
  const txtNoAgenda = document.getElementById("genNomorUrut");
  const dtTgl = document.getElementById("genTanggalSurat");
  const txtPerihal = document.getElementById("genPerihal");
  const txtKepada = document.getElementById("genKepada");
  const txtDari = document.getElementById("genDari");
  const txtPetugas = document.getElementById("genPetugas");
  const txtKet = document.getElementById("genKeterangan");

  let kode = selKode.value === "custom" ? customKode.value.trim() : selKode.value;
  let noAgenda = txtNoAgenda.value.trim() || state.nextKeluarAgenda || "609";

  let romanMonth = "X";
  let tahun = "2026";
  if (dtTgl.value) {
    const parts = dtTgl.value.split("-");
    tahun = parts[0];
    romanMonth = ROMAN_MONTHS[parseInt(parts[1], 10) - 1] || "X";
  }

  const fullNumber = `${kode}/${noAgenda}/SMA YWKA/TU/${romanMonth}/${tahun}`.replace(/\/{2,}/g, "/");

  // Baca file staged jika ada
  let fileBase64 = "";
  let fileName = "";
  let fileMime = "";
  if (state.stagedFileKeluar) {
    try {
      fileBase64 = await readFileAsBase64(state.stagedFileKeluar);
      fileName = state.stagedFileKeluar.name;
      fileMime = state.stagedFileKeluar.type;
    } catch (err) {
      console.warn("Gagal membaca file upload:", err);
    }
  }

  // No. Urut mengikuti No. Agenda sesuai permintaan pengguna!
  const payload = {
    action: "create_surat_keluar",
    no_urut: noAgenda,
    kode_klasifikasi: kode,
    nomor_urut: noAgenda,
    bulan_romawi: romanMonth,
    tahun: tahun,
    tanggal_surat: dtTgl.value,
    perihal: txtPerihal.value.trim(),
    dari: txtDari.value.trim(),
    kepada: txtKepada.value.trim(),
    petugas: txtPetugas.value.trim(),
    keterangan: txtKet.value.trim(),
    fileBase64: fileBase64,
    fileName: fileName,
    fileMime: fileMime
  };

  const newItem = {
    id: "K-" + Date.now(),
    noUrut: noAgenda, // No. Urut mengikuti No. Agenda
    status: true,
    isUnsynced: !state.appsScriptUrl,
    kodeKlasifikasi: kode,
    noAgenda: noAgenda,
    nomorLengkap: fullNumber,
    bulanRomawi: romanMonth,
    tanggal: dtTgl.value,
    perihal: payload.perihal,
    dari: payload.dari,
    kepada: payload.kepada,
    petugas: payload.petugas,
    keterangan: payload.keterangan,
    lampiran: fileName ? "Tersimpan di Drive (" + fileName + ")" : "Surat Keluar",
    driveUrl: ""
  };

  // Jika URL Apps Script belum diisi di browser ini, munculkan modal peringatan agar user tahu
  if (!state.appsScriptUrl) {
    state.pendingKeluarData = { payload, newItem, origBtnContent };
    const modalPrompt = document.getElementById("modalAppsScriptPrompt");
    if (modalPrompt) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = origBtnContent;
      modalPrompt.classList.add("show");
      return;
    }
  }

  await executeSaveSuratKeluar(payload, newItem, origBtnContent);
}

/**
 * Eksekusi penyimpanan Surat Keluar
 */
async function executeSaveSuratKeluar(payload, newItem, origBtnContent) {
  const btnSubmit = document.getElementById("btnSubmitToSheets");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;
  }

  let syncSuccess = false;
  if (state.appsScriptUrl) {
    try {
      const res = await fetch(state.appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });
      const resJson = await res.json();
      if (resJson.drive_file_url) {
        newItem.driveUrl = resJson.drive_file_url;
        newItem.lampiran = resJson.drive_file_url;
      }
      syncSuccess = true;
      newItem.isUnsynced = false;
    } catch (err) {
      console.error("Gagal sync ke Google Apps Script:", err);
      newItem.isUnsynced = true;
    }
  } else {
    newItem.isUnsynced = true;
  }

  // Simpan draft ke unsynced_surat_keluar jika belum sync ke Google Sheets
  if (newItem.isUnsynced) {
    const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");
    unsyncedList.unshift(newItem);
    localStorage.setItem("unsynced_surat_keluar", JSON.stringify(unsyncedList));
  } else {
    const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_keluar") || "[]");
    const updated = unsyncedList.filter(x => !(x.noAgenda === newItem.noAgenda && x.perihal === newItem.perihal));
    localStorage.setItem("unsynced_surat_keluar", JSON.stringify(updated));
  }

  // Tambahkan ke state utama di posisi paling atas
  state.suratKeluar.unshift(newItem);
  localStorage.setItem("cache_surat_keluar_2026", JSON.stringify(state.suratKeluar));

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = origBtnContent;
  }

  // Bersihkan staged file
  state.stagedFileKeluar = null;
  const fileInputKeluar = document.getElementById("genUploadDriveFile");
  if (fileInputKeluar) fileInputKeluar.value = "";
  const contentKeluar = document.getElementById("dropzoneContentKeluar");
  const previewKeluar = document.getElementById("filePreviewKeluar");
  if (contentKeluar) contentKeluar.style.display = "flex";
  if (previewKeluar) previewKeluar.style.display = "none";

  calculateNextSequence();
  filterSuratKeluarData();
  updateDashboardUI();

  if (syncSuccess) {
    showToast(`✅ No. Agenda ${newItem.noAgenda} berhasil tersimpan ke Google Spreadsheet & Drive!`, "success");
  } else if (!state.appsScriptUrl) {
    showToast(`⚠️ No. Agenda ${newItem.noAgenda} tersimpan aman di browser. Hubungkan Web App URL di Pengaturan agar tersinkron ke Google Sheets.`, "warning");
  } else {
    showToast(`⚠️ Gagal menyambung ke Apps Script. Data tetap tersimpan aman di browser Anda.`, "warning");
  }

  // Tampilkan Lembar Disposisi
  openDisposisiModal({
    tipe: "Surat Keluar",
    noUrut: newItem.noAgenda,
    noLengkap: newItem.nomorLengkap,
    tanggal: newItem.tanggal,
    perihal: newItem.perihal,
    kepada: newItem.kepada,
    dari: newItem.dari,
    petugas: newItem.petugas
  });
}

/**
 * Handle Penyimpanan Surat Masuk Baru
 */
async function handleCreateSuratMasuk(e) {
  e.preventDefault();

  const noAgenda = document.getElementById("inMasukNoAgenda")?.value.trim() || "";
  const tglSurat = document.getElementById("inMasukTglSurat")?.value || "";
  const tglTerima = document.getElementById("inMasukTglDiterima")?.value || "";
  const perihal = document.getElementById("inMasukPerihal")?.value.trim() || "";
  const dari = document.getElementById("inMasukDari")?.value.trim() || "";
  const kepada = document.getElementById("inMasukKepada")?.value.trim() || "SMA YWKA";
  const disposisi = document.getElementById("inMasukDisposisi")?.value.trim() || "";
  const kodeKlas = document.getElementById("inMasukKodeKlasifikasi")?.value || "";

  let fileBase64 = "";
  let fileName = "";
  let fileMime = "";
  if (state.stagedFileMasuk) {
    try {
      fileBase64 = await readFileAsBase64(state.stagedFileMasuk);
      fileName = state.stagedFileMasuk.name;
      fileMime = state.stagedFileMasuk.type;
    } catch (err) {
      console.warn("Gagal membaca file surat masuk:", err);
    }
  }

  const payload = {
    action: "create_surat_masuk",
    no_urut: state.suratMasuk.length + 1,
    no_agenda: noAgenda,
    tanggal_surat: tglSurat,
    tanggal_diterima: tglTerima,
    perihal: perihal,
    dari: dari,
    kepada: kepada,
    kode_klasifikasi: kodeKlas,
    keterangan: disposisi,
    lampiran: fileName ? "Tersimpan di Drive (" + fileName + ")" : "Surat Masuk",
    fileBase64: fileBase64,
    fileName: fileName,
    fileMime: fileMime
  };

  const newItem = {
    id: "M-" + Date.now(),
    noUrut: String(state.suratMasuk.length + 1),
    isUnsynced: !state.appsScriptUrl,
    noAgenda: noAgenda,
    tglSurat: tglSurat,
    tglMasuk: tglTerima,
    perihal: perihal,
    dari: dari,
    kepada: kepada,
    kodeKlasifikasi: kodeKlas,
    keterangan: disposisi,
    lampiran: payload.lampiran,
    driveUrl: ""
  };

  let syncSuccess = false;
  if (state.appsScriptUrl) {
    try {
      const res = await fetch(state.appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });
      const resJson = await res.json();
      if (resJson.drive_file_url) {
        newItem.driveUrl = resJson.drive_file_url;
        newItem.lampiran = resJson.drive_file_url;
      }
      syncSuccess = true;
      newItem.isUnsynced = false;
    } catch (err) {
      console.error("Gagal sync surat masuk:", err);
      newItem.isUnsynced = true;
    }
  }

  if (newItem.isUnsynced) {
    const unsyncedList = JSON.parse(localStorage.getItem("unsynced_surat_masuk") || "[]");
    unsyncedList.unshift(newItem);
    localStorage.setItem("unsynced_surat_masuk", JSON.stringify(unsyncedList));
  }

  state.suratMasuk.unshift(newItem);
  localStorage.setItem("cache_surat_masuk_2026", JSON.stringify(state.suratMasuk));

  const modalMasuk = document.getElementById("modalSuratMasuk");
  if (modalMasuk) modalMasuk.classList.remove("show");

  state.stagedFileMasuk = null;
  const fileInputMasuk = document.getElementById("inMasukUploadDrive");
  if (fileInputMasuk) fileInputMasuk.value = "";
  const contentMasuk = document.getElementById("dropzoneContentMasuk");
  const previewMasuk = document.getElementById("filePreviewMasuk");
  if (contentMasuk) contentMasuk.style.display = "flex";
  if (previewMasuk) previewMasuk.style.display = "none";

  filterSuratMasukData();
  updateDashboardUI();

  if (syncSuccess) {
    showToast(`✅ Surat Masuk "${noAgenda}" berhasil dicatat ke Spreadsheet & Drive!`, "success");
  } else {
    showToast(`⚠️ Surat Masuk "${noAgenda}" tersimpan di browser. Masukkan Web App URL di Pengaturan agar tersinkron ke Spreadsheet.`, "warning");
  }

  e.target.reset();
  initDateDefaults();
}

/**
 * Render Statistik
 */
function renderStatistics() {
  const klasMap = {};
  state.suratKeluar.forEach(item => {
    const k = item.kodeKlasifikasi || "421.3";
    klasMap[k] = (klasMap[k] || 0) + 1;
  });

  const klasContainer = document.getElementById("statKlasifikasiBars");
  if (klasContainer) {
    const total = state.suratKeluar.length || 1;
    let html = "";
    Object.keys(klasMap).sort((a, b) => klasMap[b] - klasMap[a]).forEach(k => {
      const count = klasMap[k];
      const pct = Math.round((count / total) * 100);
      html += `
        <div class="bar-item">
          <div class="bar-label-group">
            <span>Kode <strong>${escapeHtml(k)}</strong></span>
            <span>${count} surat (${pct}%)</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill bar-fill-blue" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    });
    klasContainer.innerHTML = html;
  }

  const pengirimMap = {};
  state.suratMasuk.forEach(item => {
    let p = item.dari || "Lain-lain";
    if (p.toUpperCase().includes("CADISDIK")) p = "Cabang Dinas (Cadisdik Wil. VII)";
    else if (p.toUpperCase().includes("YAYASAN")) p = "Yayasan Wanita Kereta Api";
    else if (p.toUpperCase().includes("DINAS PENDIDIKAN")) p = "Dinas Pendidikan Provinsi";
    else if (p.toUpperCase().includes("UNIVERSITAS") || p.toUpperCase().includes("INSTITUT")) p = "Universitas / Perguruan Tinggi";
    pengirimMap[p] = (pengirimMap[p] || 0) + 1;
  });

  const pengirimContainer = document.getElementById("statPengirimBars");
  if (pengirimContainer) {
    const totalM = state.suratMasuk.length || 1;
    let html = "";
    Object.keys(pengirimMap).sort((a, b) => pengirimMap[b] - pengirimMap[a]).slice(0, 5).forEach(p => {
      const count = pengirimMap[p];
      const pct = Math.round((count / totalM) * 100);
      html += `
        <div class="bar-item">
          <div class="bar-label-group">
            <span><strong>${escapeHtml(p)}</strong></span>
            <span>${count} surat (${pct}%)</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill bar-fill-emerald" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    });
    pengirimContainer.innerHTML = html;
  }

  const tbodyRecap = document.getElementById("tbodyMonthlyRecap");
  if (tbodyRecap) {
    let recapHtml = "";
    MONTH_NAMES.forEach((mName, idx) => {
      const roman = ROMAN_MONTHS[idx];
      const kCount = state.suratKeluar.filter(s => s.bulanRomawi === roman).length;
      const mCount = state.suratMasuk.filter(m => {
        const d = m.tglMasuk || m.tglSurat || "";
        return d.includes(`/${idx + 1}/`) || d.startsWith(`${idx + 1}/`);
      }).length;

      recapHtml += `
        <tr>
          <td><strong>${mName}</strong></td>
          <td><span class="code-pill">${roman}</span></td>
          <td>${kCount} surat</td>
          <td>${mCount} surat</td>
          <td><strong>${kCount + mCount} surat</strong></td>
        </tr>
      `;
    });
    tbodyRecap.innerHTML = recapHtml;
  }
}

/**
 * Buka Modal Disposisi
 */
function openDisposisiModal(data) {
  const modal = document.getElementById("modalDisposisi");
  if (!modal) return;

  document.getElementById("dispTipeSurat").textContent = data.tipe || "Surat Keluar";
  document.getElementById("dispNoUrut").textContent = data.noUrut || "-";
  document.getElementById("dispNoLengkap").textContent = data.noLengkap || "-";
  document.getElementById("dispTglSurat").textContent = data.tanggal || "-";
  document.getElementById("dispPetugas").textContent = data.petugas || "-";
  document.getElementById("dispDari").textContent = data.dari || "-";
  document.getElementById("dispKepada").textContent = data.kepada || "-";
  document.getElementById("dispPerihal").textContent = data.perihal || "-";

  modal.classList.add("show");
}

function viewDisposisiKeluar(id) {
  const item = state.suratKeluar.find(s => s.id === id);
  if (!item) return;
  openDisposisiModal({
    tipe: "Surat Keluar",
    noUrut: item.noAgenda || item.noUrut,
    noLengkap: item.nomorLengkap,
    tanggal: item.tanggal,
    perihal: item.perihal,
    kepada: item.kepada,
    dari: item.dari,
    petugas: item.petugas
  });
}

function viewDisposisiMasuk(id) {
  const item = state.suratMasuk.find(s => s.id === id);
  if (!item) return;
  openDisposisiModal({
    tipe: "Surat Masuk",
    noUrut: item.noAgenda,
    noLengkap: item.noAgenda,
    tanggal: item.tglSurat + (item.tglMasuk ? ` (Diterima: ${item.tglMasuk})` : ""),
    perihal: item.perihal,
    kepada: item.kepada,
    dari: item.dari,
    petugas: item.keterangan || "-"
  });
}

function changeKeluarPage(newPage) {
  state.pagination.keluarPage = newPage;
  renderSuratKeluarTable();
}

function changeMasukPage(newPage) {
  state.pagination.masukPage = newPage;
  renderSuratMasukTable();
}

function copyText(txt) {
  navigator.clipboard.writeText(txt);
  showToast(`Tersalin: ${txt}`, "success");
}

function exportToCsv(dataArray, filename) {
  if (!dataArray || !dataArray.length) {
    showToast("Tidak ada data untuk diunduh!", "warning");
    return;
  }
  const headers = Object.keys(dataArray[0]);
  const csvRows = [headers.join(",")];
  dataArray.forEach(item => {
    const values = headers.map(header => {
      const val = item[header] === undefined || item[header] === null ? "" : String(item[header]);
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(","));
  });
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`File ${filename} berhasil diunduh!`, "success");
}

function updateConnectionStatus(isConnected, message) {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  const syncTime = document.getElementById("lastSyncTime");

  if (dot) {
    dot.className = "status-dot " + (isConnected ? "connected" : "connecting");
  }
  if (text) text.textContent = message;
  if (syncTime) {
    const now = new Date();
    syncTime.textContent = `Sync: ${now.toLocaleTimeString("id-ID")}`;
  }
}

function setLoadingState(isLoading) {
  state.isSyncing = isLoading;
  const icon = document.getElementById("refreshIcon");
  if (icon) {
    if (isLoading) icon.classList.add("fa-spin");
    else icon.classList.remove("fa-spin");
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  let iconName = "circle-info";
  if (type === "success") iconName = "circle-check";
  else if (type === "error") iconName = "triangle-exclamation";
  else if (type === "warning") iconName = "bell";

  toast.innerHTML = `
    <i class="fa-solid fa-${iconName}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.4s ease";
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeQuotes(str) {
  if (!str) return "";
  return String(str).replace(/'/g, "\\'");
}

/**
 * Data Bawaan Riil dari Spreadsheet SMA YWKA (Termasuk rekaman No. Agenda 608)
 */
function loadBuiltinSampleData() {
  state.suratKeluar = [
    { id: "K-12", noUrut: "001", status: true, kodeKlasifikasi: "423.1", noAgenda: "001", nomorLengkap: "423.1/001/SMA YWKA/TU/I/2026", bulanRomawi: "I", tanggal: "1/6/2026", perihal: "SK Pengurus OSIS 2026-2027", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "", petugas: "", keterangan: "", lampiran: "Surat Keluar", driveUrl: "" },
    { id: "K-25", noUrut: "014", status: true, kodeKlasifikasi: "422.1", noAgenda: "014", nomorLengkap: "422.1/014/SMA YWKA/TU/I/2026", bulanRomawi: "I", tanggal: "1/14/2026", perihal: "Surat Tugas MOU SPMB SMPN 23 Bandung", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "SMPN 23 Bandung", petugas: "", keterangan: "", lampiran: "Surat Keluar", driveUrl: "" },
    { id: "K-37", noUrut: "026", status: true, kodeKlasifikasi: "421.71", noAgenda: "026", nomorLengkap: "421.71/026/SMA YWKA/TU/I/2026", bulanRomawi: "I", tanggal: "1/15/2026", perihal: "Permohonan Field Trip SMA YWKA PT. KAI", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "PT. KAI", petugas: "BU ELVIRA", keterangan: "", lampiran: "Surat Keluar", driveUrl: "" },
    { id: "K-123", noUrut: "111", status: false, kodeKlasifikasi: "425.11", noAgenda: "111", nomorLengkap: "425.11/111/SMA YWKA/TU/IV/2026", bulanRomawi: "IV", tanggal: "6/4/2026", perihal: "Bu Aam Laporan Perbaikan Gedung", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "Yayasan", petugas: "BU AAM", keterangan: "", lampiran: "Surat Keluar", driveUrl: "" },
    { id: "K-630", noUrut: "599", status: true, kodeKlasifikasi: "421.7", noAgenda: "599", nomorLengkap: "421.7/599/SMA YWKA/TU/X/2026", bulanRomawi: "X", tanggal: "12/10/2026", perihal: "Surat Pemberitahuan Pelatihan Dasar Kepemimpinan Siswa (LDKS)", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "Ketua RT 02", petugas: "Bunda Ade", keterangan: "", lampiran: "Surat Keluar", driveUrl: "" },
    { id: "K-638", noUrut: "607", status: true, kodeKlasifikasi: "421.3", noAgenda: "607", nomorLengkap: "421.3/607/SMA YWKA/TU/X/2026", bulanRomawi: "X", tanggal: "16/10/2026", perihal: "Surat Permohonan Pemberhentian Sementara Distribusi MBG", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "Yayasan", petugas: "Bunda Elvira", keterangan: "", lampiran: "Surat Keluar", driveUrl: "" },
    { id: "K-640", noUrut: "608", status: true, kodeKlasifikasi: "421.3", noAgenda: "608", nomorLengkap: "421.3/608/SMA YWKA/TU/X/2026", bulanRomawi: "X", tanggal: "21/10/2026", perihal: "Surat Dispensasi untuk Siswa yang menjadi Petugas CKG bersama UPTD Puskesmas Garuda", dari: "Syarif Hasanudin, S.Pd., Gr., M.M.", kepada: "UPTD Puskesmas Garuda", petugas: "Bunda Ayu", keterangan: "Dispensasi Petugas CKG", lampiran: "Surat Keluar", driveUrl: "" }
  ];

  state.suratMasuk = [
    { id: "M-12", noUrut: "1", noAgenda: "3025/c7.2/DM.00.02/2025", tglSurat: "02/01/2026", tglMasuk: "31/01/2026", perihal: "Validasi dan Verifikasi Data Daya Listrik dan internet", dari: "BBPMP Provinsi Jawa Barat", kepada: "SMA YWKA", kodeKlasifikasi: "", keterangan: "Kurikulum", lampiran: "Surat Masuk", driveUrl: "" },
    { id: "M-13", noUrut: "2", noAgenda: "129/PK.03.03.01-Cadisdikwil.VII", tglSurat: "08/01/2026", tglMasuk: "31/01/2026", perihal: "Himbauan untuk mengikuti Lomba Baris – Berbaris 1 Sangga Buana Tahun 2026", dari: "CABANG DINAS WIL.VII", kepada: "SMA YWKA", kodeKlasifikasi: "421.7", keterangan: "Kesiswaan", lampiran: "Surat Masuk", driveUrl: "" },
    { id: "M-14", noUrut: "3", noAgenda: "003/DITDIK YWKA/KADIV/I/2026", tglSurat: "08/01/2026", tglMasuk: "08/01/2026", perihal: "Pembinaan guru /meningkatkan kompetensi Guru dan Tenaga Kependidikan", dari: "YAYASAN WANITA KERETA API", kepada: "SMA YWKA", kodeKlasifikasi: "421.3", keterangan: "", lampiran: "Surat Masuk", driveUrl: "" }
  ];
}
