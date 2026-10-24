# OSTAY Landing Page

Static site (HTML + CSS + JS), no build step. Deployed with GitHub Pages.

## Structure
```
index.html            page markup
style.css             styles (desktop + mobile ≤768px)
script.js             CONFIG (booking links, hotels) + interactions
assets/
  brand/              logo (color / white / vertical), favicon, Booking.com logo, mascot
  hero/               hero image
  hotels/<city>/      hotel photos (tokyo, osaka, kyoto, bangkok, phuket)
  why/                Why OSTAY band images (01 space / 02 city / 03 tech)
  members/            member benefit image
  qr/                 LINE / WhatsApp / WeChat QR codes
  icons/              concierge service icons (SVG)
```

## 常用修改
- **酒店**：`script.js` 顶部 `CONFIG.hotels`。新增物业复制一行，图片放 `assets/hotels/<城市>/`。
- **主预订链接**：`CONFIG.bookingUrl`。
- **表单**：在 formspree.io 新建表单，把 `index.html` 里的 `YOUR_FORM_ID` 换成表单 ID。
- **客服信息 / 二维码**：`index.html` Footer 部分；二维码换 `assets/qr/` 同名文件。
- **换图**：同名覆盖对应文件夹里的图片即可。
