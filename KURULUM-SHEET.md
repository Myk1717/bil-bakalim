# Google Sheet + Apps Script kurulumu (10 dakika)

1. **sheets.new** adresini aç → boş bir tablo açılır. Adını "Bil Bakalım Veri" yap.
2. Üst menü: **Uzantılar → Apps Script**.
3. Açılan editörde `Code.gs` içindeki her şeyi sil. Bu klasördeki `apps-script/Code.gs` dosyasının **tamamını** kopyalayıp yapıştır. 💾 **Kaydet** (Ctrl+S).
4. Üstteki işlev listesinden **kurulum** seç → **Çalıştır**. İzin penceresi gelir:
   *İzinleri incele → hesabını seç → Gelişmiş → "… projesine git (güvenli değil)" → İzin ver.*
   (Kendi yazdığın script olduğu için Google bu uyarıyı gösterir.) Tabloda `olaylar` sayfası ve başlık satırı oluşur.
5. Sağ üst: **Dağıt → Yeni dağıtım** → dişli ⚙️ → **Web uygulaması**.
   - Açıklama: `v1`
   - Şu kullanıcı olarak çalıştır: **Ben**
   - Erişimi olanlar: **Herkes** (giriş yapmadan; oyuncular anonim gönderir)
   → **Dağıt**. Çıkan **Web uygulaması URL'sini** kopyala (`https://script.google.com/macros/s/…/exec`).
6. Test: URL'nin sonuna `?action=stats` ekleyip tarayıcıda aç → `{"ok":true,…}` görmelisin.
7. URL'yi bana gönder; `VITE_EVENTS_URL` olarak girip siteyi yeniden yayınlarım.
   (O zamana kadar oyuncuların cevapları telefonlarında bekler; adres eklenince otomatik gönderilir.)

**Kodu sonradan değiştirirsen:** Dağıt → Dağıtımları yönet → kalem ✏️ → Sürüm: *Yeni sürüm* → Dağıt. (Böylece URL aynı kalır.)

**Notlar**
- "Bunu bilenlerin %X" ve "Oyuncular ne dedi?" jokeri, bir soru **30 cevaba** ulaşınca kendiliğinden görünür (eşik: `app.config.js` → `statsMinAnswers`). İstatistik 5 dakikada bir tazelenir.
- Sütunların anlamı `README.md` içinde.
