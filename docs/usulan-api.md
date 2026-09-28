# Usulan API Backend

Status: **disetujui** · 28 September 2026

Pilihan layanan untuk backend analisis Cek Kredibilitas Artikel, dengan target biaya Rp0 untuk skala proyek akhir. Semua batas gratis di bawah dicek per September 2026 dan bisa berubah; cek ulang sebelum demo.

## Arsitektur

- Satu Netlify Function: `GET /api/analisis?url=<link artikel>`, file JS biasa di `netlify/functions/`.
- Hanya memakai `fetch` bawaan Node, tanpa `package.json` dan tanpa library.
- Batas waktu function sinkron di Netlify 60 detik; alurnya ditargetkan selesai di bawah 30 detik.
- API key disimpan di environment variables Netlify, tidak pernah di kode browser.
- Respons memakai bentuk JSON yang sama dengan `public/data/contoh/*.json`, jadi `public/js/hasil.js` bisa langsung merendernya.

### Alur

1. **Ekstraksi:** Jina Reader mengambil judul, isi, dan tanggal terbit dari link.
2. **Pemisahan (Gemini, panggilan 1):** setiap kalimat diberi label klaim atau opini, tiga klaim utama dipilih, kata kunci pencarian dibuat per klaim, dan penulis atau tanggal dilengkapi jika belum ditemukan. Keluaran berupa JSON.
3. **Pencocokan, dijalankan paralel:**
   - Google Fact Check Tools API, satu request per klaim (`languageCode=id`).
   - Tavily Search, satu request per klaim, dengan domain artikel asal dikecualikan.
4. **Sikap (Gemini, panggilan 2):** setiap artikel pembanding diberi label mendukung, membantah, atau netral, beserta catatan singkat.
5. **Skor:** dihitung di kode dari sinyal di atas dengan bobot 35/25/15/25, bukan ditebak oleh model. Model hanya memberi label; angka dan alasannya bisa ditelusuri.
6. **Cache:** respons disimpan di CDN Netlify per URL, sehingga link yang sama tidak dianalisis ulang dan kuota API tidak terpakai lagi.

   ```
   Netlify-CDN-Cache-Control: public, durable, s-maxage=604800
   Netlify-Vary: query=url
   Netlify-Cache-ID: analisis
   ```

   `Netlify-Cache-ID` membuat cache tetap ada setelah deploy baru. Tanpa header itu, setiap deploy menghapus cache function.

## Layanan

| Langkah | Layanan | Kuota gratis | Pemakaian per analisis | Cadangan |
|---|---|---|---|---|
| Ekstraksi artikel | Jina Reader (`https://r.jina.ai/<url>`) | Tanpa key ±20 request/menit; key gratis 10 juta token | 1 request | Parse JSON-LD dan meta tag dari HTML sendiri |
| Klaim/opini, sikap | Gemini API, model 3.5 Flash-Lite | Gratis, ±500 request/hari (angka pihak ketiga; cek di AI Studio) | 2 request | Groq (paket gratis) |
| Fact-check | Google Fact Check Tools API | Gratis dengan API key | 3 request | Tavily dibatasi ke situs cek fakta Indonesia |
| Artikel pembanding | Tavily Search (basic) | 1.000 kredit/bulan, tanpa kartu kredit | 3 kredit | Google News RSS |
| Cache | CDN Netlify | Termasuk | — | — |

**Kapasitas:** batasnya ada di Tavily, sekitar 330 analisis baru per bulan. Link yang sudah ada di cache tidak memakai kuota.

### Catatan per layanan

- **Gemini:** data yang dikirim lewat paket gratis dipakai Google untuk mengembangkan produknya. Aman untuk artikel publik; jangan kirim data pribadi pengguna.
- **Google Fact Check:** sejak pertengahan 2025 Google tidak lagi menampilkan cek fakta (ClaimReview) di Search, jadi penerbit mungkin makin jarang menandai cek fakta baru. Jika hasilnya sering kosong, aktifkan cadangan: pencarian Tavily dengan `include_domains` situs cek fakta Indonesia (misalnya cekfakta.com, turnbackhoax.id, cekfakta.tempo.co, kompas.com/cekfakta). Cadangan ini menambah 3 kredit Tavily per analisis, sehingga kapasitas turun menjadi sekitar 165 analisis per bulan.
- **Tavily:** hasil pencarian sudah berisi URL asli dan cuplikan isi, jadi artikel pembanding tidak perlu diambil satu per satu.
- **Jina Reader:** beberapa situs berita bisa menolak permintaan otomatis; parse HTML sendiri menjadi cadangan.

## Tidak dipakai

| Layanan | Alasan |
|---|---|
| Google Custom Search JSON API | Tutup untuk pengguna baru; berhenti total 1 Januari 2027 |
| Brave Search API | Paket gratis dihapus; wajib kartu kredit, hanya kredit $5/bulan |
| GDELT DOC API | Hasil kosong untuk kueri berbahasa Indonesia saat dites; dibatasi 1 request per 5 detik |
| Gemini + Grounding with Google Search | Tidak tersedia di paket gratis untuk Gemini 3.5 Flash dan Flash-Lite |
| Netlify AI Gateway | Memakan kredit Netlify (180 kredit per $1) yang juga dipakai untuk deploy |

## Pembanding berbayar

Claude Haiku 4.5 tidak punya paket gratis: $1 per juta token input, $5 per juta token output. Dengan perkiraan ±7 ribu token masuk dan ±1.500 token keluar per analisis, biayanya sekitar $0,015 (±Rp250) per analisis. Relevan hanya jika kualitas klasifikasi Gemini ternyata kurang.

## Yang perlu disiapkan

| Environment variable (Netlify) | Dari mana | Wajib |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio | Ya |
| `FACTCHECK_API_KEY` | Google Cloud project, aktifkan Fact Check Tools API | Ya |
| `TAVILY_API_KEY` | tavily.com | Ya |
| `JINA_API_KEY` | jina.ai | Tidak (menaikkan batas request) |

## Kuota Netlify

Paket Free berbasis kredit (akun dibuat setelah 4 September 2025): 300 kredit per bulan, batas keras. Jika habis, semua situs di akun dijeda sampai bulan berikutnya.

| Pemakaian | Biaya |
|---|---|
| Deploy produksi (setiap push ke `main` yang di-deploy) | 15 kredit |
| Compute function | 10 kredit per GB-jam (±0,08 kredit per analisis 30 detik) |
| Web request | 2 kredit per 10.000 request |
| Bandwidth | 20 kredit per GB |

Deploy adalah pemakaian terbesar. `netlify.toml` punya aturan `ignore` supaya commit yang tidak menyentuh `public/`, `netlify/`, atau `netlify.toml` tidak di-deploy.

## Sumber

- [Netlify: How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)
- [Netlify: Functions configuration](https://docs.netlify.com/build/functions/configuration/)
- [Netlify: Caching overview](https://docs.netlify.com/build/caching/caching-overview/)
- [Netlify: Ignore builds](https://docs.netlify.com/build/configure-builds/ignore-builds/)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini free tier limits 2026 (pihak ketiga)](https://aipromptshub.co/blog/gemini-api-free-tier-rate-limits)
- [Fact Check Tools API](https://developers.google.com/fact-check/tools/api)
- [Poynter: Google removes ClaimReview snippets](https://www.poynter.org/ifcn/2025/google-claimreview-fact-checks-snippets-removed/)
- [Tavily: Credits & pricing](https://docs.tavily.com/documentation/api-credits)
- [Jina Reader](https://jina.ai/reader/)
- [Google Custom Search API shutdown](https://searchenginewatch.com/google-details-partner-only-search-api-as-custom-search-nears-shutdown/)
- [Brave Search API free tier removed](https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/)
- [Groq free tier 2026](https://klymentiev.com/blog/groq-pricing)
