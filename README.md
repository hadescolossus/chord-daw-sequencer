# Chord DAW Sequencer

React + Vite ile hazırlanmış akor tabanlı web sequencer uygulaması.

## Yerelde çalıştırma

Gereksinim: Node.js

```bash
npm install
npm run dev
```

Tarayıcıda şu adresi aç:

```text
http://localhost:3000
```

## Yayına hazırlık kontrolü

```bash
npm run build
```

Build çıktısı `dist/` klasörüne alınır.

## GitHub'a yükleme

```bash
git init
git add .
git commit -m "Initial web app"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADIN/chord-daw-sequencer.git
git push -u origin main
```

`KULLANICI_ADIN` kısmını kendi GitHub kullanıcı adınla değiştir.

## Vercel'e yükleme

1. Vercel'de `Add New > Project` seç.
2. GitHub hesabını bağla ve `chord-daw-sequencer` reposunu seç.
3. Framework Preset: `Vite`
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Deploy butonuna bas.

Bu uygulama Gemini API anahtarı gerektirmez; ses üretimi tarayıcıdaki Web Audio API ile yapılır.
