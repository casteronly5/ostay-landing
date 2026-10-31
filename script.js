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
  document.querySelectorAll('[data-booking="main"]').forEach(a => (a.href = CONFIG.bookingUrl));
}

/* ---------- Booking links ---------- */
document.querySelectorAll('[data-booking="main"]').forEach(a => (a.href = CONFIG.bookingUrl));

/* ---------- Destinations: city cards → city view ---------- */
const stage = document.getElementById('destStage');
const gridEl = document.getElementById('cityGrid');
const viewEl = document.getElementById('cityView');
const hotelsEl = document.getElementById('hotels');
const countEl = document.getElementById('cityCount');
const allEl = document.getElementById('cityAll');
const panelImg = document.getElementById('cityPanelImg');
const panelName = document.getElementById('cityPanelName');
const panelMeta = document.getElementById('cityPanelMeta');
const isMobile = () => matchMedia('(max-width:768px)').matches;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, reduced() ? 0 : ms));
const stays = n => `${n} ${n === 1 ? 'stay' : 'stays'}`;
let busy = false;

const PIN = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="6.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

function hotelCard(h, i) {
  return `<article class="hotel slide-in" style="animation-delay:${120 + i * 60}ms">
      <div class="hotel__img"><img src="${esc(h.image)}" alt="${esc(h.name)}" loading="lazy"></div>
      <div class="hotel__body">
        <h3 class="hotel__name">${esc(h.name)}</h3>
        <p class="hotel__loc">${PIN}${esc(h.location)}</p>
        ${h.address ? `<p class="hotel__addr">${esc(h.address)}</p>` : ''}
        ${h.tags?.length ? `<div class="hotel__tags">${h.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <a class="bk-btn" href="${esc(h.url)}" target="_blank" rel="noopener" aria-label="Book ${esc(h.name)} on Booking.com">
          <img src="assets/brand/booking-logo.png" alt="Booking.com"><span>↗</span>
        </a>
      </div>
    </article>`;
}

function buildCities() {
  gridEl.innerHTML = CONFIG.cities.map(c => {
    const n = CONFIG.hotels[c.id]?.length || 0;
    return `<button class="city" type="button" role="listitem" data-city="${esc(c.id)}" aria-label="${esc(c.name)} — ${stays(n)}">
      <span class="city__img"><img src="${esc(c.image)}" alt="" loading="lazy"></span>
      <span class="city__meta"><span><span class="city__name">${esc(c.name)}</span><span class="city__sub">${c.country ? esc(c.country) + '  ·  ' : ''}${stays(n)}</span></span><span class="city__arrow" aria-hidden="true">→</span></span>
    </button>`;
  }).join('');
}

function scrollToStage() {
  const top = stage.getBoundingClientRect().top + scrollY - (isMobile() ? 80 : 120);
  if (Math.abs(scrollY - top) > 40) scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' });
}

async function openCity(id, btn) {
  if (busy) return; busy = true;
  const city = CONFIG.cities.find(c => c.id === id);
  const list = CONFIG.hotels[id] || [];
  const from = btn?.querySelector('.city__img')?.getBoundingClientRect();

  // fill the view
  panelImg.style.setProperty('--img', `url("${city.image}")`);
  panelName.textContent = city.name;
  panelMeta.textContent = `${city.country ? city.country + '  ·  ' : ''}${stays(list.length)}`;
  countEl.textContent = `${city.name}  ·  ${stays(list.length)}`;
  allEl.href = city.allUrl || '#'; allEl.hidden = !city.allUrl;
  hotelsEl.innerHTML = list.map(hotelCard).join('');

  if (isMobile()) {
    gridEl.hidden = true; viewEl.hidden = false;
    stage.classList.remove('push-back'); void stage.offsetWidth; stage.classList.add('push-in');
    scrollToStage();
    await wait(450); busy = false; return;
  }

  // 1. other cities fade out
  gridEl.querySelectorAll('.city').forEach(c => { if (c !== btn) c.classList.add('is-leaving'); });
  await wait(280);
  // 2. swap and grow the chosen image into the panel (FLIP)
  gridEl.hidden = true; viewEl.hidden = false; viewEl.classList.remove('is-leaving');
  const to = panelImg.getBoundingClientRect();
  if (from && !reduced()) {
    panelImg.animate([
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, borderRadius: '20px' },
      { transform: 'none', borderRadius: '24px' }
    ], { duration: 520, easing: 'cubic-bezier(.22,.61,.36,1)' });
    viewEl.querySelectorAll('.city-back, .city-panel__name, .city-panel__meta').forEach((el, i) =>
      el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 260 + i * 60, fill: 'backwards', easing: 'ease-out' }));
  }
  scrollToStage();
  await wait(520); busy = false;
  document.getElementById('cityBack').focus({ preventScroll: true });
}

async function backToCities() {
  if (busy) return; busy = true;
  const id = panelName.textContent;
  if (isMobile()) {
    viewEl.hidden = true; gridEl.hidden = false;
    gridEl.querySelectorAll('.city').forEach(c => c.classList.remove('is-leaving'));
    stage.classList.remove('push-in'); void stage.offsetWidth; stage.classList.add('push-back');
    scrollToStage(); await wait(450); busy = false; return;
  }
  viewEl.classList.add('is-leaving');
  await wait(300);
  viewEl.hidden = true; viewEl.classList.remove('is-leaving'); gridEl.hidden = false;
  gridEl.querySelectorAll('.city').forEach((c, i) => {
    c.classList.remove('is-leaving', 'is-entering'); void c.offsetWidth;
    c.style.animationDelay = `${i * 60}ms`; c.classList.add('is-entering');
  });
  scrollToStage();
  await wait(560); busy = false;
  const last = gridEl.querySelector(`.city[aria-label^="${CSS.escape(id)}"]`); last?.focus({ preventScroll: true });
}

gridEl.addEventListener('click', e => { const b = e.target.closest('.city'); if (b) openCity(b.dataset.city, b); });
document.getElementById('cityBack').addEventListener('click', backToCities);

/* ---------- Load content ---------- */
const slug = s => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
Promise.all([
  fetch('content/site.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => null),
  fetch('content/hotels.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => null),
]).then(([site, cities]) => {
  if (site) { SITE = site; hydrate(site); }
  if (Array.isArray(cities)) {
    CONFIG.cities = cities.map(c => ({ id: c.id || slug(c.name), name: c.name, country: c.country || '', image: asset(c.image), allUrl: c.all_url || '' }));
    CONFIG.hotels = Object.fromEntries(cities.map(c => [c.id || slug(c.name), (c.hotels || []).map(h => ({ ...h, image: asset(h.image) }))]));
  }
  buildCities();
});

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
