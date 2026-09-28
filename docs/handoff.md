# Handoff: Cek Kredibilitas Artikel

Sep 28, 2026 · @Aditya's Home

Website ini menerima link artikel, memisahkan klaim faktual dari opini, mencari artikel lain yang membahas klaim yang sama, lalu memberi skor kredibilitas beserta alasannya. Semua komponennya bisa dibangun dengan biaya Rp0 untuk skala project akhir, asal pemilihan API memperhatikan perubahan free tier di 2026.

## Ringkasan produk

Pengguna menempel satu link artikel berita, lalu dalam kurang dari 30 detik mendapat skor kredibilitas 0–100 plus bukti yang bisa dicek sendiri.

- **Masalah:** pembaca sulit membedakan berita berbasis data dari opini atau hoaks, dan jarang sempat mengecek sumber lain.
- **Pengguna:** pembaca umum dan mahasiswa; dosen penguji sebagai pengguna demo.
- **Output utama:** skor, daftar klaim faktual vs kalimat opini, hasil fact-check yang sudah ada, dan 3–5 artikel lain yang mendukung atau membantah klaim.
- **Prinsip:** sistem memberi *indikator kredibilitas*, bukan vonis benar/salah. Setiap angka harus disertai alasan dan link bukti.

## Scope MVP

MVP fokus ke satu alur utuh: link masuk, skor dan bukti keluar. Fitur lain ditunda sampai alur ini stabil dan terevaluasi.

| Masuk MVP | Ditunda (nice to have) |
| --- | --- |
| Input satu URL artikel berita | Input teks bebas atau screenshot |
| Ekstraksi judul, penulis, tanggal, isi | Ekstensi browser |
| Klasifikasi kalimat: klaim faktual / opini | Deteksi gambar atau video palsu |
| Ambil 3 klaim utama | Akun pengguna dan riwayat |
| Cek Google Fact Check Tools API | Analisis media sosial |
| Cari 3–5 artikel serupa + label mendukung/membantah/netral | Multi-bahasa penuh |
| Skor 0–100 dengan rincian alasan | Dashboard statistik |
| Cache hasil per URL | Feedback pengguna untuk retraining |
