/* ============================================================
   OSTAY — content is managed in /content (site.json, hotels.json)
   and edited through the Pages CMS admin. Everything below renders it.
   ============================================================ */
let CONFIG = { bookingUrl: 'https://www.booking.com/', cities: [], hotels: {}, defaultCity: 'osaka' };
let SITE = null;

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const asset = p => (p || '').replace(/^\//, '');

function hydrate(site) {
  document.querySelectorAll('[data-t]').forEach(el => { const v = get(site, el.dataset.t); if (typeof v === 'string' && v) el.innerHTML = nl2br(v); });
  document.querySelectorAll('[data-src]').forEach(el => { const v = get(site, el.dataset.src); if (v) el.src = asset(v); });
  document.querySelectorAll('[data-bg]').forEach(el => { const v = get(site, el.dataset.bg); if (v) el.style.setProperty('--img', `url("${asset(v)}")`); });
  document.querySelectorAll('[data-tags]').forEach(el => { const v = get(site, el.dataset.tags); if (Array.isArray(v)) el.innerHTML = v.map(t => `<span class="tag">${esc(t)}</span>`).join(''); });
  document.querySelectorAll('[data-li]').forEach(el => { const v = get(site, el.dataset.li); if (Array.isArray(v)) el.innerHTML = v.map(t => `<li>${esc(t)}</li>`).join(''); });
  const f = site.footer || {};
  if (Array.isArray(f.contacts)) document.getElementById('contactList').innerHTML = f.contacts.map(c => {
    const ext = /^https?:/.test(c.link || '');
    const val = c.link ? `<a href="${esc(c.link)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${esc(c.value)}</a>` : esc(c.value);
    return `<dt>${esc(c.label)}</dt><dd>${val}</dd>`;
  }).join('');
  if (Array.isArray(f.qr_codes)) document.getElementById('qrList').innerHTML = f.qr_codes.map(q =>
    `<figure class="qr"><img src="${esc(asset(q.image))}" alt="${esc(q.label)} QR code" loading="lazy"><figcaption>${esc(q.label)}</figcaption></figure>`).join('');
  const pv = document.getElementById('privacyLink'); if (f.privacy_url) pv.href = f.privacy_url;
  if (site.formspree_id) document.getElementById('helloForm').action = 'https://formspree.io/f/' + site.formspree_id.trim();
  if (site.booking_url) CONFIG.bookingUrl = site.booking_url;
  if (site.default_city) CONFIG.defaultCity = site.default_city;
  document.querySelectorAll('[data-booking="main"]').forEach(a => (a.href = CONFIG.bookingUrl));
}

/* ---------- Booking links ---------- */
document.querySelectorAll('[data-booking="main"]').forEach(a => (a.href = CONFIG.bookingUrl));

/* ---------- City tabs + hotels ---------- */
const tabsEl = document.getElementById('cityTabs');
const hotelsEl = document.getElementById('hotels');
const countEl = document.getElementById('cityCount');
const allEl = document.getElementById('cityAll');
const carouselCount = document.getElementById('carouselCount');

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function render(cityId) {
  const city = CONFIG.cities.find(c => c.id === cityId);
  const list = CONFIG.hotels[cityId] || [];
  tabsEl.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.city === cityId));
  countEl.textContent = `${city.name}  ·  ${list.length} ${list.length === 1 ? 'stay' : 'stays'}`;
  allEl.innerHTML = `View all ${esc(city.name)} stays on Booking.com <span>↗</span>`;
  allEl.href = city.allUrl || '#';
  allEl.hidden = !city.allUrl;
  hotelsEl.innerHTML = list.map((h, i) => `
    <article class="hotel" style="animation-delay:${i * 60}ms">
      <div class="hotel__img"><img src="${esc(h.image)}" alt="${esc(h.name)}" loading="lazy"></div>
      <div class="hotel__body">
        <h3 class="hotel__name">${esc(h.name)}</h3>
        <p class="hotel__loc"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="6.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>${esc(h.location)}</p>
        ${h.address ? `<p class="hotel__addr">${esc(h.address)}</p>` : ''}
        ${h.tags?.length ? `<div class="hotel__tags">${h.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <a class="bk-btn" href="${esc(h.url)}" target="_blank" rel="noopener" aria-label="Book ${esc(h.name)} on Booking.com">
          <img src="assets/brand/booking-logo.png" alt="Booking.com"><span>↗</span>
        </a>
      </div>
    </article>`).join('');
  hotelsEl.scrollLeft = 0;
  updateCarousel();
}

function buildTabs() {
  tabsEl.innerHTML = CONFIG.cities.map(c => {
    const n = CONFIG.hotels[c.id]?.length || 0;
    return `<button class="tab" role="tab" data-city="${esc(c.id)}" aria-selected="false">${esc(c.name)} <small>${n}</small></button>`;
  }).join('');
  const start = CONFIG.cities.find(c => c.id === CONFIG.defaultCity) ? CONFIG.defaultCity : CONFIG.cities[0]?.id;
  if (start) render(start);
}
tabsEl.addEventListener('click', e => {
  const t = e.target.closest('.tab');
  if (t) render(t.dataset.city);
});

/* ---------- Load content ---------- */
const slug = s => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
Promise.all([
  fetch('content/site.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => null),
  fetch('content/hotels.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => null),
]).then(([site, cities]) => {
  if (site) { SITE = site; hydrate(site); }
  if (Array.isArray(cities)) {
    CONFIG.cities = cities.map(c => ({ id: c.id || slug(c.name), name: c.name, allUrl: c.all_url || '' }));
    CONFIG.hotels = Object.fromEntries(cities.map(c => [c.id || slug(c.name), (c.hotels || []).map(h => ({ ...h, image: asset(h.image) }))]));
  }
  buildTabs();
});

/* Mobile carousel counter */
function updateCarousel() {
  const cards = hotelsEl.children;
  if (!cards.length) return;
  const w = cards[0].getBoundingClientRect().width + 16;
  const i = Math.min(cards.length, Math.round(hotelsEl.scrollLeft / w) + 1);
  carouselCount.textContent = `${i} / ${cards.length}`;
}
hotelsEl.addEventListener('scroll', () => requestAnimationFrame(updateCarousel), { passive: true });

/* ---------- Accordion ---------- */
document.querySelectorAll('.acc__item').forEach(item => {
  item.querySelector('.acc__btn').addEventListener('click', () => {
    const open = item.classList.contains('open');
    document.querySelectorAll('.acc__item').forEach(o => {
      o.classList.remove('open');
      o.querySelector('.acc__btn').setAttribute('aria-expanded', 'false');
      o.querySelector('.acc__icon').textContent = '+';
    });
    if (!open) {
      item.classList.add('open');
      item.querySelector('.acc__btn').setAttribute('aria-expanded', 'true');
      item.querySelector('.acc__icon').textContent = '–';
    }
  });
});

/* ---------- Member card tilt ---------- */
const card = document.getElementById('memberCard');
if (card && matchMedia('(hover:hover)').matches) {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`;
  });
  card.addEventListener('mouseleave', () => (card.style.transform = ''));
}

/* ---------- Header, menu, sticky bar ---------- */
const header = document.getElementById('header');
const menuBtn = document.getElementById('menuBtn');
const sticky = document.getElementById('stickyBook');
const heroEl = document.querySelector('.hero');
const ctaBox = document.querySelector('.cta__box');

menuBtn.addEventListener('click', () => {
  const open = header.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', open);
});
document.querySelectorAll('.nav a').forEach(a => a.addEventListener('click', () => header.classList.remove('open')));

function onScroll() {
  header.classList.toggle('scrolled', scrollY > 10);
  const pastHero = heroEl.getBoundingClientRect().bottom < 0;
  const r = ctaBox.getBoundingClientRect();
  const ctaVisible = r.top < innerHeight && r.bottom > 0;
  sticky.classList.toggle('show', pastHero && !ctaVisible);
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- Scroll reveal ---------- */
const io = new IntersectionObserver(entries => {
  entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

/* ---------- Say Hello form (Formspree) ---------- */
const form = document.getElementById('helloForm');
const statusEl = document.getElementById('formStatus');
form.addEventListener('submit', async e => {
  e.preventDefault();
  if (form.action.includes('YOUR_FORM_ID')) {
    statusEl.textContent = 'Form is not connected yet — add the Formspree ID in the site settings.';
    return;
  }
  const btn = form.querySelector('button');
  btn.disabled = true;
  statusEl.textContent = 'Sending…';
  try {
    const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error();
    form.reset();
    statusEl.textContent = 'Thank you! We’ll be in touch soon.';
  } catch {
    statusEl.textContent = 'Something went wrong. Please email vip@ostay.net.';
  } finally {
    btn.disabled = false;
  }
});
