/* ============================================================
   OSTAY — site config
   Edit the links and hotels below. Everything else is automatic.
   ============================================================ */
const CONFIG = {
  // Main "Book your stay ↗" link (official booking site)
  bookingUrl: 'https://www.booking.com/',

  // City tabs (in order). `allUrl` is optional — leave '' to hide "View all … ↗".
  cities: [
    { id: 'tokyo',   name: 'Tokyo',   allUrl: '' },
    { id: 'osaka',   name: 'Osaka',   allUrl: '' },
    { id: 'kyoto',   name: 'Kyoto',   allUrl: '' },
    { id: 'bangkok', name: 'Bangkok', allUrl: '' },
    { id: 'phuket',  name: 'Phuket',  allUrl: '' },
  ],
  defaultCity: 'osaka',

  // Hotels per city — from 物业List.xlsx
  // name / location (short, shown on card) / address (full, shown on hover) / tags (optional) / image / url
  hotels: {
    tokyo: [
      { name: 'Ueno', location: 'Higashi-Ueno, Taito-ku, Tokyo', address: '5-5-22-4 Higashi-Ueno, Taito-ku, Tokyo 110-0015', image: 'assets/hotels/tokyo/ueno.jpg', url: 'https://www.booking.com/hotel/jp/minn-higashi-ueno.html' },
    ],
    osaka: [
      { name: 'Dotonbori', location: 'Kozu, Chuo-ku, Osaka', address: '2-6-17 Kozu, Chuo-ku, Osaka 542-0072', image: 'assets/hotels/osaka/dotonbori.jpg', url: 'https://www.booking.com/hotel/jp/ostay-dotonbori-east-apartment.html' },
      { name: 'Imamiya', location: 'Naniwa-higashi, Naniwa-ku, Osaka', address: '3-7-12 Naniwa-higashi, Naniwa-ku, Osaka 556-0025', image: 'assets/hotels/osaka/imamiya.jpg', url: 'https://www.booking.com/hotel/jp/vermillion.html' },
      { name: 'Shin-Osaka', location: 'Higashi-Nakajima, Higashiyodogawa-ku, Osaka', address: '1-18-32 Higashi-Nakajima, Higashiyodogawa-ku, Osaka 533-0033', image: 'assets/hotels/osaka/shin-osaka.jpg', url: 'https://www.booking.com/hotel/jp/ostay-shin-osaka-apartment.html' },
      { name: 'Kitahama', location: 'Kitahama, Chuo-ku, Osaka', address: '2-4-12 Kitahama, Chuo-ku, Osaka 541-0041', image: 'assets/hotels/osaka/kitahama.jpg', url: 'https://www.booking.com/hotel/jp/ostay-kitahama-apartment.html' },
      { name: 'Ebisu', location: 'Ebisu-higashi, Naniwa-ku, Osaka', address: '1-12-11 Ebisu-higashi, Naniwa-ku, Osaka 556-0002', image: 'assets/hotels/osaka/ebisu.jpg', url: 'https://www.booking.com/hotel/jp/ostay-namba-ebisu.html' },
      { name: 'Namba South', location: 'Nipponbashi-nishi, Naniwa-ku, Osaka', address: '1-8-21 Nipponbashi-nishi, Naniwa-ku, Osaka 556-0004', image: 'assets/hotels/osaka/namba-south.jpg', url: 'https://www.booking.com/hotel/jp/ostay-namba-south.html' },
      { name: 'Kita-Horie', location: 'Kita-Horie, Nishi-ku, Osaka', address: '2-6-12 Kita-Horie, Nishi-ku, Osaka 550-0014', image: 'assets/hotels/osaka/kita-horie.jpg', url: 'https://www.booking.com/hotel/jp/south-east-inn-da-ban-shi.html' },
    ],
    kyoto: [
      { name: 'Nishikujo', location: 'Nishikujo, Minami-ku, Kyoto', address: '35 Nishikujo Yokocho, Minami-ku, Kyoto 601-8427', image: 'assets/hotels/kyoto/nishikujo.jpg', url: 'https://www.booking.com/hotel/jp/the-plun-residence-kyoto-s.html' },
    ],
    bangkok: [
      { name: 'Siamese Exclusive Queens', location: 'Khlong Toei, Bangkok', address: '388 Soi Phai Sing To, Khlong Toei, Bangkok 10110', image: 'assets/hotels/bangkok/siamese-exclusive-queens.jpg', url: 'https://www.booking.com/hotel/th/new-family-suite-near-asok-and-queen-sirikit-center.html' },
    ],
    phuket: [
      { name: 'Utopia Karon', location: 'Karon, Mueang Phuket, Phuket', address: '8/99 Soi 14, Karon, Mueang Phuket, Phuket 83100', image: 'assets/hotels/phuket/utopia-karon.jpg', url: 'https://www.booking.com/hotel/th/karon-utopia.html' },
    ],
  },
};

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

tabsEl.innerHTML = CONFIG.cities.map(c => {
  const n = CONFIG.hotels[c.id]?.length || 0;
  return `<button class="tab" role="tab" data-city="${c.id}" aria-selected="false">${c.name} <small>${n}</small></button>`;
}).join('');
tabsEl.addEventListener('click', e => {
  const t = e.target.closest('.tab');
  if (t) render(t.dataset.city);
});
render(CONFIG.defaultCity || CONFIG.cities[0].id);

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
    statusEl.textContent = 'Form is not connected yet — add your Formspree ID in index.html.';
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
    statusEl.textContent = 'Something went wrong. Please email support@ostay.example.';
  } finally {
    btn.disabled = false;
  }
});
