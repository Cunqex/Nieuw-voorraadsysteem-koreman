import { sb, $, $$, toast, esc, comboSet } from './ui.js?v=20261121123332';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=20261121123332';
import * as dashboard from './pages/dashboard.js?v=20261121123332';
import * as artikelen from './pages/artikelen.js?v=20261121123332';
import * as designs from './pages/designs.js?v=20261121123332';
import * as relaties from './pages/relaties.js?v=20261121123332';
import * as inkoop from './pages/inkoop.js?v=20261121123332';
import * as verkoop from './pages/verkoop.js?v=20261121123332';
import * as stalen from './pages/stalen.js?v=20261121123332';
import * as instellingen from './pages/instellingen.js?v=20261121123332';
import * as importeren from './pages/importeren.js?v=20261121123332';
import * as rapportage from './pages/rapportage.js?v=20261121123332';
import * as telling from './pages/telling.js?v=20261121123332';
import * as docs from './docs.js?v=20261121123332';

// route-patroon → handler(container, params)
const routes = [
  [/^\/?$/, dashboard.render],
  [/^\/artikelen$/, artikelen.renderList],
  [/^\/artikel\/(new|\d+)$/, artikelen.renderDetail],
  [/^\/designs$/, designs.renderList],
  [/^\/design\/(new|\d+)$/, designs.renderDetail],
  [/^\/klanten$/, (c) => relaties.renderList(c, 'klanten')],
  [/^\/klant\/(\d+)$/, (c, p) => relaties.renderKlant(c, p)],
  [/^\/leveranciers$/, (c) => relaties.renderList(c, 'leveranciers')],
  [/^\/leverancier\/(\d+)$/, (c, p) => relaties.renderLeverancier(c, p)],
  [/^\/inkoop$/, inkoop.renderList],
  [/^\/inkoop\/(\d+)$/, inkoop.renderDetail],
  [/^\/verkoop$/, verkoop.renderList],
  [/^\/verkoop\/(\d+)$/, verkoop.renderDetail],
  [/^\/stalen$/, stalen.render],
  [/^\/instellingen$/, instellingen.render],
  [/^\/importeren$/, importeren.render],
  [/^\/rapportage$/, rapportage.render],
  [/^\/telling$/, telling.render],
];

let routeToken = 0;
async function route(opts = {}) {
  const hash = location.hash.slice(1) || '/';
  const [path, qs] = hash.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));

  // Documentweergave (inkooporder / offerte / orderbevestiging / factuur)
  const dm = path.match(/^\/doc\/(po|so)\/(\d+)(?:\/(\w+))?$/);
  if (dm) {
    document.body.classList.add('doc-mode');
    $('#doc').classList.remove('hidden');
    await docs.render($('#doc'), dm[1], Number(dm[2]), dm[3], query);
    return;
  }
  document.body.classList.remove('doc-mode');
  $('#doc').classList.add('hidden');
  $('#doc').innerHTML = '';

  closeMenu();
  $$('#sidebar a').forEach((a) => {
    const target = a.getAttribute('href').slice(1);
    const first = '/' + (path.split('/')[1] || '');
    const tfirst = '/' + (target.split('/')[1] || '');
    const same = tfirst === first || (tfirst === '/artikelen' && first === '/artikel') || (tfirst === '/designs' && first === '/design')
      || (tfirst === '/klanten' && first === '/klant') || (tfirst === '/leveranciers' && first === '/leverancier');
    a.classList.toggle('active', same);
  });

  // Elke weergave wordt in een NIEUW element opgebouwd en pas daarna getoond.
  // Zo blijven er nooit oude klik-handlers hangen (voorheen ging een knop
  // daardoor meerdere keren af) en flikkert de pagina niet bij verversen.
  const main = $('#main');
  const token = ++routeToken;
  const view = document.createElement('div');
  view.className = 'view';
  main.classList.add('loading');
  let found = false;
  for (const [re, handler] of routes) {
    const m = path.match(re);
    if (!m) continue;
    found = true;
    try {
      await handler(view, m.slice(1), query);
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="card"><h2>Er ging iets mis</h2><p>${esc(e.message || e)}</p><p><button class="btn" onclick="location.reload()">Pagina opnieuw laden</button></p></div>`;
    }
    break;
  }
  if (!found) view.innerHTML = '<div class="card">Pagina niet gevonden. <a href="#/">Naar overzicht</a></div>';
  if (token !== routeToken) return; // er is intussen al een nieuwere weergave gevraagd
  const keep = opts.keepScroll ? captureState(main) : null;
  const y = window.scrollY;
  main.replaceChildren(view);
  main.classList.remove('loading');
  if (keep) { restoreState(view, keep); window.scrollTo(0, y); } else window.scrollTo(0, 0);
}

// Onthoud bij verversen wat de gebruiker aan het typen was (focus + nog niet opgeslagen velden)
function keyOf(el) {
  const regel = el.closest('[data-regel]');
  if (regel && el.dataset.f) return `[data-regel="${regel.dataset.regel}"] [data-f="${el.dataset.f}"]`;
  const form = el.closest('form[id]');
  if (form && el.name) return `#${form.id} [name="${el.name}"]`;
  if (el.id) return '#' + el.id;
  return null;
}
function captureState(root) {
  const dirty = [];
  $$('input, textarea, select', root).forEach((el) => {
    if (el.type === 'file' || el.type === 'checkbox' || el.classList.contains('combo-q')) return;
    const changed = el.tagName === 'SELECT' ? [...el.options].some((o) => o.selected !== o.defaultSelected) : el.value !== el.defaultValue;
    const key = changed && keyOf(el);
    if (key) dirty.push([key, el.value]);
  });
  const act = document.activeElement && root.contains(document.activeElement) ? keyOf(document.activeElement) : null;
  return { dirty, act };
}
function restoreState(view, { dirty, act }) {
  dirty.forEach(([key, val]) => {
    const el = view.querySelector(key);
    if (!el || el.value === val) return;
    el.value = val;
    const combo = el.closest('.combo');
    if (combo) comboSet(combo, val);
  });
  if (act) { const el = view.querySelector(act); if (el) { el.focus(); el.select?.(); } }
}

function closeMenu() {
  $('#sidebar').classList.remove('open');
  $('#backdrop').classList.remove('open');
}

// Lijn-iconen: vervang <i data-lucide="..."> door SVG, ook na elke schermwissel
let iconTimer;
function refreshIcons() {
  clearTimeout(iconTimer);
  iconTimer = setTimeout(() => {
    if (window.lucide && document.querySelector('i[data-lucide]')) window.lucide.createIcons();
  }, 0);
}
new MutationObserver(refreshIcons).observe(document.body, { childList: true, subtree: true });
refreshIcons();

async function showApp(session) {
  if (!session) {
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    return;
  }
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#user-email').textContent = session.user.email;
  $('#user-initials').textContent = session.user.email.slice(0, 2);
  await route();
}

// ---------- Init ----------
if (SUPABASE_URL.includes('JOUW-PROJECT') || SUPABASE_ANON_KEY.includes('JOUW-')) {
  document.body.innerHTML = `<div class="login"><div class="login-box"><h1>Nog niet ingesteld</h1>
    <p>Vul in <code>js/config.js</code> de Supabase anon key in.</p></div></div>`;
} else {
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    $('#login-msg').textContent = 'Bezig…';
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value, password: f.password.value });
    $('#login-msg').textContent = error ? 'Inloggen mislukt: ' + error.message : '';
  };
  $('#logout').onclick = async () => { await sb.auth.signOut(); };
  $('#menu-toggle').onclick = () => { $('#sidebar').classList.add('open'); $('#backdrop').classList.add('open'); };
  $('#backdrop').onclick = closeMenu;
  $('#global-search').onsubmit = (e) => {
    e.preventDefault();
    const q = $('#global-q').value.trim();
    location.hash = '#/artikelen' + (q ? '?q=' + encodeURIComponent(q) : '');
    $('#global-q').value = '';
  };

  let current = null;
  sb.auth.onAuthStateChange((_ev, session) => {
    const id = session?.user?.id || null;
    if (id === current) return;
    current = id;
    showApp(session);
  });
  window.addEventListener('hashchange', () => { if (current) route(); });
  window.addEventListener('app:refresh', () => { if (current) route({ keepScroll: true }); });
  const { data } = await sb.auth.getSession();
  if (!data.session) showApp(null);
}

window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.message) toast(e.reason.message, 'error');
});
