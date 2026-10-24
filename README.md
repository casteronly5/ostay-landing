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

## 后台（Pages CMS）
内容都在 `content/site.json`（页面文字、图片、联系方式、链接）和 `content/hotels.json`（城市与酒店）。
后台配置在 `.pages.yml`。

- 打开 https://app.pagescms.org ，用有本仓库权限的 GitHub 账号登录，选 `ostay-landing`。
- 改完点 Save，会自动提交到 GitHub，约 1 分钟后网站更新。
- 给客户开通：仓库 Settings → Collaborators → Add people，加客户的 GitHub 账号（Write 权限）。未加之前客户无法进入后台。

## 常用修改
- 以上内容都可以在后台改；不用后台时也可以直接编辑 `content/` 里的两个 JSON 文件。
- **表单**：在 formspree.io 新建表单，把 ID 填进后台 “Formspree form ID”。
- **换图**：同名覆盖对应文件夹里的图片即可。
