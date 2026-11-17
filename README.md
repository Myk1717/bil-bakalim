# Bil Bakalım — MVP

Telefonda oynanan kısa bilgi oyunu. Vite + düz JavaScript, backend yok, her şey tarayıcıda (localStorage).

- **Adı değiştirmek:** `app.config.js` → `name`, `shortName`, `tagline`.
- **Sorular:** `public/questions.json` (kod değiştirmeden düzenlenir).
- **Olay kaydı adresi:** tek değişken `VITE_EVENTS_URL` (GitHub'da *Settings → Secrets and variables → Actions → Variables*; yerelde `.env`).
- **Apps Script kodu:** `apps-script/Code.gs`.

## Yerelde çalıştırma

```bash
npm install
npm run dev        # http://localhost:5190
npm run build      # dist/ klasörü
```

## Yayın

`main` dalına her push'ta GitHub Actions derleyip GitHub Pages'e yükler (`.github/workflows/deploy.yml`).

## Soru nasıl eklenir

1. `public/questions.json` dosyasını aç (GitHub'da kalem simgesiyle doğrudan düzenlenebilir).
2. Son `}` kapanışından sonra virgül koyup yeni bir blok ekle: `id`, `level` (1-10), `cat`, `q`, `options` (4 şık), `answer` (doğru şıkkın sırası, 0'dan başlar), `info`, `source`.
3. `id` benzersiz olsun (`k011`, `k012`…); bir kez yayınlanan sorunun `id`'sini değiştirme, istatistikler ona bağlı.
4. Şık sırası oyunda zaten karışır; doğru cevabı istediğin sıraya yazabilirsin, `answer` ona göre.
5. Kaydet (commit) → 1-2 dakikada canlıda. Günlük tur tarihe göre havuzdan 5 soru seçer; havuz büyüdükçe tekrar azalır.

## Sheet sütunları (`olaylar` sayfası)

| Sütun | Anlamı |
|---|---|
| sunucu_zamani | Olayın Sheet'e yazıldığı an |
| olay_id | Olayın benzersiz kimliği (çift kayıt ayıklamak için) |
| istemci_zamani | Olayın telefonda olduğu an (çevrimdışı beklediyse sunucu zamanından eski olur) |
| cihaz_id | Rastgele, anonim cihaz kimliği (kişiyle eşleşmez) |
| olay | `cevap`, `oy`, `anket`, `joker`, `atla`, `tur_basladi`, `tur_bitti`, `tur_birakildi`, `paylasim` |
| mod | `gunluk` veya `merdiven` |
| soru_id | `questions.json` içindeki `id` |
| dogru_mu | 1 = doğru, 0 = yanlış (yalnız `cevap`) |
| secilen_sik | Seçilen şıkkın JSON'daki orijinal sırası (0-3), karıştırmadan bağımsız |
| secilen_metin | Seçilen şıkkın metni |
| sure_ms | Soru ekrana geldikten cevaba kadar geçen süre (milisaniye) |
| basamak | Merdivende basamak, günlükte soru sırası (1'den başlar) |
| oy | `eglenceli` / `sikici` (👍/👎) |
| tekrar_oynar | `kesinlikle` / `belki` / `hayir` |
| yorum | Serbest metin kutusu |
| skor | Tur sonu: günlükte doğru sayısı, merdivende çıkılan basamak |
| joker | Kullanılan joker (`fifty`, `crowd`, `skip`) ya da paylaşım tipi (`kopyala`, `paylas`) |
| surum | Uygulama sürümü |
