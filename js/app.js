import { sb, $, $$, toast, esc } from './ui.js';
import { SUPABASE_URL } from './config.js';
import * as dashboard from './pages/dashboard.js';
import * as artikelen from './pages/artikelen.js';
import * as designs from './pages/designs.js';
import * as relaties from './pages/relaties.js';
import * as inkoop from './pages/inkoop.js';
import * as verkoop from './pages/verkoop.js';
import * as stalen from './pages/stalen.js';
import * as instellingen from './pages/instellingen.js';
import * as docs from './docs.js';

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
];

async function route() {
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

  const main = $('#main');
  $('#sidebar').classList.remove('open');
  $$('#sidebar a').forEach((a) => {
    const target = a.getAttribute('href').slice(1);
    const first = '/' + (path.split('/')[1] || '');
    const tfirst = '/' + (target.split('/')[1] || '');
    const same = tfirst === first || (tfirst === '/artikelen' && first === '/artikel') || (tfirst === '/designs' && first === '/design')
      || (tfirst === '/klanten' && first === '/klant') || (tfirst === '/leveranciers' && first === '/leverancier');
    a.classList.toggle('active', same);
  });

  for (const [re, handler] of routes) {
    const m = path.match(re);
    if (m) {
      main.innerHTML = '<p class="muted">Laden…</p>';
      try {
        await handler(main, m.slice(1), query);
      } catch (e) {
        console.error(e);
        main.innerHTML = `<div class="card"><h2>Er ging iets mis</h2><p>${esc(e.message || e)}</p></div>`;
      }
      window.scrollTo(0, 0);
      return;
    }
  }
  main.innerHTML = '<div class="card">Pagina niet gevonden. <a href="#/">Naar overzicht</a></div>';
}

async function showApp(session) {
  if (!session) {
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    return;
  }
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#user-email').textContent = session.user.email;
  await route();
}

// ---------- Init ----------
if (SUPABASE_URL.includes('JOUW-PROJECT')) {
  document.body.innerHTML = `<div class="login"><div class="login-box"><h1>Nog niet ingesteld</h1>
    <p>Vul in <code>js/config.js</code> de Supabase-URL en anon key in.</p></div></div>`;
} else {
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    $('#login-msg').textContent = 'Bezig…';
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value, password: f.password.value });
    $('#login-msg').textContent = error ? 'Inloggen mislukt: ' + error.message : '';
  };
  $('#logout').onclick = async () => { await sb.auth.signOut(); };
  $('#menu-toggle').onclick = () => $('#sidebar').classList.toggle('open');

  let current = null;
  sb.auth.onAuthStateChange((_ev, session) => {
    const id = session?.user?.id || null;
    if (id === current) return;
    current = id;
    showApp(session);
  });
  window.addEventListener('hashchange', () => { if (current) route(); });
  const { data } = await sb.auth.getSession();
  if (!data.session) showApp(null);
}

window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.message) toast(e.reason.message, 'error');
});
