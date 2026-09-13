// ============================================================
// CONFIGURAZIONE
// ============================================================
const API_URL = 'https://marcatempo-api.elettimp.workers.dev';

// ============================================================
// STATO GLOBALE
// ============================================================
var APP = { user: null, token: null };
var TIMBRATURE_CACHE = [];
var COMMESSE_CACHE = [];
var RIEPILOGO_CACHE = null;
var chartOre = null;

// ============================================================
// UTILITY
// ============================================================
function $(id) { return document.getElementById(id); }
function show(id) { var el = $(id); if (el) el.classList.remove('hidden'); }
function hide(id) { var el = $(id); if (el) el.classList.add('hidden'); }

function showMessage(containerId, type, text) {
  var el = $(containerId);
  if (!el) return;
  el.className = 'alert alert-' + type;
  el.innerHTML = '';
  el.appendChild(document.createTextNode(text + ' '));
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-close float-end';
  btn.addEventListener('click', function() { el.classList.add('d-none'); });
  el.appendChild(btn);
  el.classList.remove('d-none');
  setTimeout(function() { el.classList.add('d-none'); }, 3500);
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function callApi(path, payload) {
  return fetch(API_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  })
    .then(function(res) { return res.json(); })
    .catch(function(err) {
      return { success: false, error: 'Errore di rete: ' + err.message };
    });
}

function doLogout() {
  if (APP.token) callApi('/api/logout', { token: APP.token });
  try { localStorage.removeItem('marcatempo_token'); } catch(e) {}
  APP.user = null;
  APP.token = null;
  window.location.href = 'logout.html';
}

var PAGE = window.location.pathname.split('/').pop() || 'index.html';
if (PAGE === '' || PAGE === '/') PAGE = 'index.html';

// ============================================================
// FILTRI TIMBRATURE
// ============================================================
function renderTimbratureTable(tbodyId, showUser, context) {
  var tbody = $(tbodyId);
  if (!tbody) return;

  var filtered = applyFiltri(TIMBRATURE_CACHE, context);

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="15" class="text-center text-muted py-3">Nessuna timbratura trovata con i filtri attivi</td></tr>';
    return;
  }

  var html = '';
  filtered.forEach(function(t) {
    html += buildRow(t, showUser);
  });
  tbody.innerHTML = html;
}

function applyFiltri(data, context) {
  var fUtente = $('filtroUtente') ? $('filtroUtente').value : '';
  var fCommessa = $('filtroCommessa') ? $('filtroCommessa').value : '';
  var fTipo = $('filtroTipo') ? $('filtroTipo').value : '';
  var fRicerca = $('filtroRicerca') ? $('filtroRicerca').value.trim().toLowerCase() : '';

  return data.filter(function(t) {
    if (fUtente && String(t.id_utente) !== String(fUtente)) return false;
    if (fCommessa && String(t.id_commessa) !== String(fCommessa)) return false;
    if (fTipo === 'ferie' && !t.ferie) return false;
    if (fTipo === 'malattia' && !t.malattia) return false;
    if (fTipo === 'straordinari') {
      var str = (Number(t.ore_straord_festive)||0) + (Number(t.ore_straord_feriali)||0);
      if (str <= 0) return false;
    }
    if (fTipo === 'viaggio' && (Number(t.ore_viaggio)||0) <= 0) return false;
    if (fRicerca) {
      var searchIn = [
        t.note || '', t.cliente || '', t.numero_commessa || '',
        t.cantiere || '', t.nome_utente || ''
      ].join(' ').toLowerCase();
      if (searchIn.indexOf(fRicerca) === -1) return false;
    }
    return true;
  });
}

function resetFiltri(context) {
  if ($('filtroUtente')) $('filtroUtente').value = '';
  if ($('filtroCommessa')) $('filtroCommessa').value = '';
  if ($('filtroTipo')) $('filtroTipo').value = '';
  if ($('filtroRicerca')) $('filtroRicerca').value = '';
  var meseId = context === 'admin' ? 'filtroMeseAdmin' : 'filtroMese';
  if ($(meseId)) $(meseId).value = new Date().toISOString().slice(0,7);
  if (context === 'admin') loadTimbratureAdmin();
  else loadTimbratureCollab();
}

function populateCommesseFilter(selectId) {
  var sel = $(selectId);
  if (!sel) return;
  var current = sel.value;
  sel.innerHTML = '<option value="">Tutte</option>';
  COMMESSE_CACHE.forEach(function(c) {
    sel.innerHTML += '<option value="' + c.id + '">' + escapeHtml(c.numero_commessa) + ' - ' + escapeHtml(c.cliente) + '</option>';
  });
  sel.value = current;
}

function populateUtentiFilter(selectId) {
  var sel = $(selectId);
  if (!sel) return;
  callApi('/api/utenti').then(function(r) {
    if (r && r.success) {
      var current = sel.value;
      sel.innerHTML = '<option value="">Tutti</option>';
      r.data.forEach(function(u) {
        sel.innerHTML += '<option value="' + u.id + '">' + escapeHtml(u.nome_completo || u.username) + '</option>';
      });
      sel.value = current;
    }
  });
}

// ============================================================
// COSTRUZIONE RIGA TIMBRATURA
// ============================================================
function buildRow(t, showUser) {
  var tot = (Number(t.ore_ordinarie)||0) + (Number(t.ore_straord_feriali)||0) + (Number(t.ore_straord_festive)||0);
  var ferie = t.ferie ? '<span class="badge bg-info">Si</span>' : '<span class="text-muted">-</span>';
  var malattia = t.malattia ? '<span class="badge bg-warning text-dark">Si</span>' : '<span class="text-muted">-</span>';
  var noteFull = escapeHtml(t.note || '');
  var note = noteFull ? '<span title="' + noteFull + '">' + noteFull.substring(0, 40) + (noteFull.length > 40 ? '...' : '') + '</span>' : '<span class="text-muted">-</span>';

  var html = '<tr>';
  html += '<td>' + (t.data_lavoro || '-') + '</td>';
  if (showUser) {
    html += '<td>' + escapeHtml(t.nome_utente || '-') + '</td>';
  } else {
    html += '<td>' + escapeHtml((APP.user && (APP.user.nome || APP.user.username)) || '-') + '</td>';
  }
  html += '<td>' + (t.ore_ordinarie || 0) + '</td>';
  html += '<td>' + (t.ore_straord_feriali || 0) + '</td>';
  html += '<td>' + (t.ore_straord_festive || 0) + '</td>';
  html += '<td><strong>' + tot + '</strong></td>';
  html += '<td>' + (t.ore_viaggio || 0) + '</td>';
  html += '<td>' + escapeHtml(t.numero_commessa || '-') + '</td>';
  html += '<td>' + escapeHtml(t.cliente || '-') + '</td>';
  html += '<td>' + escapeHtml(t.cantiere || '-') + '</td>';
  html += '<td>' + note + '</td>';
  html += '<td>' + ferie + '</td>';
  html += '<td>' + malattia + '</td>';

  html += '<td class="text-nowrap">';
  html += '<button class="btn btn-sm btn-outline-primary me-1" title="Modifica" onclick="apriModificaTimbratura(' + t.id + ', ' + (showUser ? 'true' : 'false') + ')"><i class="bi bi-pencil"></i></button>';
  if (showUser) {
    html += '<button class="btn btn-sm btn-outline-danger" title="Elimina" onclick="eliminaTimbratura(' + t.id + ')"><i class="bi bi-trash"></i></button>';
  }
  html += '</td>';
  html += '</tr>';
  return html;
}

// ============================================================
// VALIDAZIONE ORE
// ============================================================
function validaOre(ord, strF, strFe) {
  ord = Number(ord) || 0;
  strF = Number(strF) || 0;
  strFe = Number(strFe) || 0;
  if (ord > 8) return { ok: false, error: 'Le ore ordinarie non possono superare 8.' };
  if (ord + strF + strFe > 14) return { ok: false, error: 'Il totale (ordinario + straordinari) non puo superare 14 ore.' };
  return { ok: true };
}

// ============================================================
// MODALE MODIFICA TIMBRATURA
// ============================================================
function apriModificaTimbratura(id, isAdmin) {
  var t = TIMBRATURE_CACHE.find(function(x) { return String(x.id) === String(id); });
  if (!t) { alert('Timbratura non trovata'); return; }

  if (!$('modalModificaTimbratura')) {
    var html = '' +
      '<div class="modal fade" id="modalModificaTimbratura" tabindex="-1">' +
      '<div class="modal-dialog modal-lg"><div class="modal-content">' +
      '<div class="modal-header bg-primary text-white">' +
      '<h5 class="modal-title"><i class="bi bi-pencil-square me-2"></i>Modifica Timbratura</h5>' +
      '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>' +
      '</div>' +
      '<div class="modal-body">' +
      '<form id="formModificaTimbratura" class="row g-3">' +
      '<input type="hidden" name="id">' +
      '<div class="col-md-6"><label class="form-label small text-muted">Data</label>' +
      '<input type="text" class="form-control" name="data_lavoro" disabled></div>' +
      '<div class="col-md-6"><label class="form-label small text-muted">Nome dipendente</label>' +
      '<input type="text" class="form-control" name="nome_utente" disabled></div>' +
      '<div class="col-12"><label class="form-label small text-muted">Commessa</label>' +
      '<select class="form-select" name="id_commessa" id="modTimCommessa" required></select></div>' +
      '<div class="col-md-3 col-6"><label class="form-label small text-muted">Ordinario</label>' +
      '<input type="number" step="0.5" min="0" class="form-control" name="ore_ordinarie"></div>' +
      '<div class="col-md-3 col-6"><label class="form-label small text-muted">Str. Feriale</label>' +
      '<input type="number" step="0.5" min="0" class="form-control" name="ore_straord_feriali"></div>' +
      '<div class="col-md-3 col-6"><label class="form-label small text-muted">Str. Festivo</label>' +
      '<input type="number" step="0.5" min="0" class="form-control" name="ore_straord_festive"></div>' +
      '<div class="col-md-3 col-6"><label class="form-label small text-muted">Viaggio</label>' +
      '<input type="number" step="0.5" min="0" class="form-control" name="ore_viaggio"></div>' +
      '<div class="col-md-6"><div class="form-check form-switch">' +
      '<input type="checkbox" class="form-check-input" name="ferie" id="modTimFerie">' +
      '<label class="form-check-label" for="modTimFerie">Ferie</label></div></div>' +
      '<div class="col-md-6"><div class="form-check form-switch">' +
      '<input type="checkbox" class="form-check-input" name="malattia" id="modTimMalattia">' +
      '<label class="form-check-label" for="modTimMalattia">Malattia</label></div></div>' +
      '<div class="col-12"><label class="form-label small text-muted">Note</label>' +
      '<textarea class="form-control" name="note" rows="2"></textarea></div>' +
      '</form>' +
      '</div>' +
      '<div class="modal-footer">' +
      '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annulla</button>' +
      '<button type="button" class="btn btn-primary" id="btnSalvaModificaTim"><i class="bi bi-save me-1"></i>Salva</button>' +
      '</div>' +
      '</div></div></div>';
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div);
  }

  var sel = $('modTimCommessa');
  sel.innerHTML = '<option value="">Seleziona commessa...</option>';
  COMMESSE_CACHE.forEach(function(c) {
    sel.innerHTML += '<option value="' + c.id + '">' + escapeHtml(c.numero_commessa) + ' - ' + escapeHtml(c.cliente) + '</option>';
  });

  var form = $('formModificaTimbratura');
  form.querySelector('[name=id]').value = t.id;
  form.querySelector('[name=data_lavoro]').value = t.data_lavoro || '';
  form.querySelector('[name=nome_utente]').value = t.nome_utente || (APP.user.nome || APP.user.username);
  form.querySelector('[name=id_commessa]').value = t.id_commessa || '';
  form.querySelector('[name=ore_ordinarie]').value = t.ore_ordinarie || 0;
  form.querySelector('[name=ore_straord_feriali]').value = t.ore_straord_feriali || 0;
  form.querySelector('[name=ore_straord_festive]').value = t.ore_straord_festive || 0;
  form.querySelector('[name=ore_viaggio]').value = t.ore_viaggio || 0;
  form.querySelector('[name=ferie]').checked = !!t.ferie;
  form.querySelector('[name=malattia]').checked = !!t.malattia;
  form.querySelector('[name=note]').value = t.note || '';

  $('btnSalvaModificaTim').onclick = function() { salvaModificaTimbratura(isAdmin); };

  var modal = new bootstrap.Modal($('modalModificaTimbratura'));
  modal.show();
}
window.apriModificaTimbratura = apriModificaTimbratura;

function salvaModificaTimbratura(isAdmin) {
  var form = $('formModificaTimbratura');
  var fd = new FormData(form);
  var data = {
    id: parseInt(fd.get('id')),
    id_commessa: parseInt(fd.get('id_commessa')),
    ore_ordinarie: parseFloat(fd.get('ore_ordinarie')) || 0,
    ore_straord_feriali: parseFloat(fd.get('ore_straord_feriali')) || 0,
    ore_straord_festive: parseFloat(fd.get('ore_straord_festive')) || 0,
    ore_viaggio: parseFloat(fd.get('ore_viaggio')) || 0,
    ferie: fd.get('ferie') === 'on',
    malattia: fd.get('malattia') === 'on',
    note: fd.get('note') || ''
  };

  if (!data.id_commessa) { alert('Seleziona una commessa'); return; }

  if (!isAdmin) {
    var check = validaOre(data.ore_ordinarie, data.ore_straord_feriali, data.ore_straord_festive);
    if (!check.ok) { alert(check.error); return; }
  }

  var btn = $('btnSalvaModificaTim');
  var orig = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvataggio...';
  btn.disabled = true;

  callApi('/api/timbratura/update', data).then(function(r) {
    btn.innerHTML = orig;
    btn.disabled = false;
    if (r && r.success) {
      var modal = bootstrap.Modal.getInstance($('modalModificaTimbratura'));
      if (modal) modal.hide();
      if (isAdmin) {
        showMessage('adminMessage', 'success', r.message);
        loadTimbratureAdmin();
      } else {
        showMessage('collabMessage', 'success', r.message);
        loadTimbratureCollab();
        loadOggi();
      }
    } else {
      alert('Errore: ' + ((r && r.error) || 'Errore'));
    }
  });
}

// ============================================================
// MODALE MODIFICA COMMESSA
// ============================================================
function apriModificaCommessa(id) {
  var c = COMMESSE_CACHE.find(function(x) { return String(x.id) === String(id); });
  if (!c) { alert('Commessa non trovata'); return; }

  if (!$('modalModificaCommessa')) {
    var html = '' +
      '<div class="modal fade" id="modalModificaCommessa" tabindex="-1">' +
      '<div class="modal-dialog"><div class="modal-content">' +
      '<div class="modal-header bg-primary text-white">' +
      '<h5 class="modal-title"><i class="bi bi-pencil-square me-2"></i>Modifica Commessa</h5>' +
      '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>' +
      '</div>' +
      '<div class="modal-body">' +
      '<form id="formModificaCommessa" class="row g-3">' +
      '<input type="hidden" name="id">' +
      '<div class="col-12"><label class="form-label small text-muted">Numero</label>' +
      '<input type="text" class="form-control" name="numero_commessa" required></div>' +
      '<div class="col-12"><label class="form-label small text-muted">Cliente</label>' +
      '<input type="text" class="form-control" name="cliente" required></div>' +
      '<div class="col-12"><label class="form-label small text-muted">Cantiere</label>' +
      '<input type="text" class="form-control" name="cantiere"></div>' +
      '<div class="col-12"><label class="form-label small text-muted">Descrizione</label>' +
      '<input type="text" class="form-control" name="descrizione"></div>' +
      '</form>' +
      '</div>' +
      '<div class="modal-footer">' +
      '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annulla</button>' +
      '<button type="button" class="btn btn-primary" id="btnSalvaModificaComm"><i class="bi bi-save me-1"></i>Salva</button>' +
      '</div>' +
      '</div></div></div>';
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div);
  }

  var form = $('formModificaCommessa');
  form.querySelector('[name=id]').value = c.id;
  form.querySelector('[name=numero_commessa]').value = c.numero_commessa || '';
  form.querySelector('[name=cliente]').value = c.cliente || '';
  form.querySelector('[name=cantiere]').value = c.cantiere || '';
  form.querySelector('[name=descrizione]').value = c.descrizione || '';

  $('btnSalvaModificaComm').onclick = function() {
    var fd = new FormData(form);
    var data = {
      id: parseInt(fd.get('id')),
      numero_commessa: fd.get('numero_commessa'),
      cliente: fd.get('cliente'),
      cantiere: fd.get('cantiere') || '',
      descrizione: fd.get('descrizione') || ''
    };
    if (!data.numero_commessa || !data.cliente) { alert('Numero e cliente richiesti'); return; }

    var btn = $('btnSalvaModificaComm');
    var orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvataggio...';
    btn.disabled = true;

    callApi('/api/commessa/update', data).then(function(r) {
      btn.innerHTML = orig;
      btn.disabled = false;
      if (r && r.success) {
        var modal = bootstrap.Modal.getInstance($('modalModificaCommessa'));
        if (modal) modal.hide();
        showMessage('adminMessage', 'success', r.message);
        loadCommesse();
      } else {
        alert('Errore: ' + ((r && r.error) || 'Errore'));
      }
    });
  };

  var modal = new bootstrap.Modal($('modalModificaCommessa'));
  modal.show();
}
window.apriModificaCommessa = apriModificaCommessa;

// ============================================================
// MODALE MODIFICA UTENTE
// ============================================================
function apriModificaUtente(id) {
  callApi('/api/utenti').then(function(r) {
    if (!r || !r.success) { alert('Errore caricamento utenti'); return; }
    var u = r.data.find(function(x) { return String(x.id) === String(id); });
    if (!u) { alert('Utente non trovato'); return; }

    if (!$('modalModificaUtente')) {
      var html = '' +
        '<div class="modal fade" id="modalModificaUtente" tabindex="-1">' +
        '<div class="modal-dialog"><div class="modal-content">' +
        '<div class="modal-header bg-primary text-white">' +
        '<h5 class="modal-title"><i class="bi bi-pencil-square me-2"></i>Modifica Utente</h5>' +
        '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>' +
        '</div>' +
        '<div class="modal-body">' +
        '<form id="formModificaUtente" class="row g-3">' +
        '<input type="hidden" name="id">' +
        '<div class="col-12"><label class="form-label small text-muted">Username</label>' +
        '<input type="text" class="form-control" name="username" required></div>' +
        '<div class="col-12"><label class="form-label small text-muted">Nome completo</label>' +
        '<input type="text" class="form-control" name="nome_completo" required></div>' +
        '<div class="col-12"><label class="form-label small text-muted">Email</label>' +
        '<input type="email" class="form-control" name="email"></div>' +
        '<div class="col-md-6"><label class="form-label small text-muted">Ruolo</label>' +
        '<select class="form-select" name="ruolo"><option value="collaboratore">Collaboratore</option><option value="admin">Admin</option></select></div>' +
        '<div class="col-md-6"><label class="form-label small text-muted">Stato</label>' +
        '<select class="form-select" name="attivo"><option value="1">Attivo</option><option value="0">Disattivato</option></select></div>' +
        '<div class="col-12"><label class="form-label small text-muted">Nuova password (lascia vuoto per non cambiarla)</label>' +
        '<input type="password" class="form-control" name="password" placeholder="..."></div>' +
        '</form>' +
        '</div>' +
        '<div class="modal-footer">' +
        '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annulla</button>' +
        '<button type="button" class="btn btn-primary" id="btnSalvaModificaUt"><i class="bi bi-save me-1"></i>Salva</button>' +
        '</div>' +
        '</div></div></div>';
      var div = document.createElement('div');
      div.innerHTML = html;
      document.body.appendChild(div);
    }

    var form = $('formModificaUtente');
    form.querySelector('[name=id]').value = u.id;
    form.querySelector('[name=username]').value = u.username || '';
    form.querySelector('[name=nome_completo]').value = u.nome_completo || '';
    form.querySelector('[name=email]').value = u.email || '';
    form.querySelector('[name=ruolo]').value = u.ruolo || 'collaboratore';
    form.querySelector('[name=attivo]').value = u.attivo ? '1' : '0';
    form.querySelector('[name=password]').value = '';

    $('btnSalvaModificaUt').onclick = function() {
      var fd = new FormData(form);
      var data = {
        id: parseInt(fd.get('id')),
        username: fd.get('username'),
        nome_completo: fd.get('nome_completo'),
        email: fd.get('email') || '',
        ruolo: fd.get('ruolo'),
        attivo: fd.get('attivo') === '1',
        password: fd.get('password') || ''
      };
      if (!data.username || !data.nome_completo) { alert('Username e nome richiesti'); return; }

      var btn = $('btnSalvaModificaUt');
      var orig = btn.innerHTML;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvataggio...';
      btn.disabled = true;

      callApi('/api/utente/update', data).then(function(r) {
        btn.innerHTML = orig;
        btn.disabled = false;
        if (r && r.success) {
          var modal = bootstrap.Modal.getInstance($('modalModificaUtente'));
          if (modal) modal.hide();
          showMessage('adminMessage', 'success', r.message);
          loadUtenti();
          loadCollaboratoriPerAssegnazione();
          populateUtentiFilter('filtroUtente');
        } else {
          alert('Errore: ' + ((r && r.error) || 'Errore'));
        }
      });
    };

    var modal = new bootstrap.Modal($('modalModificaUtente'));
    modal.show();
  });
}
window.apriModificaUtente = apriModificaUtente;

// ============================================================
// RIEPILOGO MENSILE
// ============================================================
function initRiepilogo() {
  var meseEl = $('riepilogoMese');
  if (!meseEl) return;
  meseEl.value = new Date().toISOString().slice(0,7);
  meseEl.addEventListener('change', loadRiepilogo);
  loadRiepilogo();
}

function loadRiepilogo() {
  var mese = $('riepilogoMese').value || new Date().toISOString().slice(0,7);
  callApi('/api/riepilogo', { mese: mese }).then(function(r) {
    if (!r || !r.success) {
      $('riepilogoCollabList').innerHTML = '<tr><td colspan="8" class="text-center text-danger py-3">' + ((r && r.error) || 'Errore') + '</td></tr>';
      $('riepilogoCommList').innerHTML = '<tr><td colspan="7" class="text-center text-danger py-3">' + ((r && r.error) || 'Errore') + '</td></tr>';
      return;
    }
    RIEPILOGO_CACHE = r.data;
    renderRiepilogo(r.data);
  });
}
window.loadRiepilogo = loadRiepilogo;

function renderRiepilogo(d) {
  var tot = d.totali || {};
  $('ripTotOre').textContent = (Number(tot.tot_ore) || 0).toFixed(1);
  $('ripTotOrd').textContent = (Number(tot.tot_ordinario) || 0).toFixed(1);
  var totStr = (Number(tot.tot_str_feriale) || 0) + (Number(tot.tot_str_festivo) || 0);
  $('ripTotStr').textContent = totStr.toFixed(1);
  $('ripTotViag').textContent = (Number(tot.tot_viaggio) || 0).toFixed(1);

  var tbody1 = $('riepilogoCollabList');
  if (!d.per_collaboratore || d.per_collaboratore.length === 0) {
    tbody1.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Nessun dato</td></tr>';
  } else {
    var html1 = '';
    d.per_collaboratore.forEach(function(c) {
      html1 += '<tr>' +
        '<td><strong>' + escapeHtml(c.nome || c.username) + '</strong></td>' +
        '<td>' + (Number(c.tot_ordinario) || 0).toFixed(1) + '</td>' +
        '<td>' + (Number(c.tot_str_feriale) || 0).toFixed(1) + '</td>' +
        '<td>' + (Number(c.tot_str_festivo) || 0).toFixed(1) + '</td>' +
        '<td>' + (Number(c.tot_viaggio) || 0).toFixed(1) + '</td>' +
        '<td>' + (Number(c.giorni_ferie) || 0) + '</td>' +
        '<td>' + (Number(c.giorni_malattia) || 0) + '</td>' +
        '<td><strong>' + (Number(c.tot_ore) || 0).toFixed(1) + '</strong></td>' +
        '</tr>';
    });
    tbody1.innerHTML = html1;
  }

  var tbody2 = $('riepilogoCommList');
  if (!d.per_commessa || d.per_commessa.length === 0) {
    tbody2.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Nessun dato</td></tr>';
  } else {
    var html2 = '';
    d.per_commessa.forEach(function(c) {
      html2 += '<tr>' +
        '<td><strong>' + escapeHtml(c.numero_commessa || '-') + '</strong></td>' +
        '<td>' + escapeHtml(c.cliente || '-') + '</td>' +
        '<td>' + escapeHtml(c.cantiere || '-') + '</td>' +
        '<td>' + (Number(c.tot_ordinario) || 0).toFixed(1) + '</td>' +
        '<td>' + (Number(c.tot_straordinari) || 0).toFixed(1) + '</td>' +
        '<td>' + (Number(c.tot_viaggio) || 0).toFixed(1) + '</td>' +
        '<td><strong>' + (Number(c.tot_ore) || 0).toFixed(1) + '</strong></td>' +
        '</tr>';
    });
    tbody2.innerHTML = html2;
  }

  renderGrafico(d.per_collaboratore || []);
}

function renderGrafico(collabs) {
  if (typeof Chart === 'undefined') return;
  var ctx = $('graficoOre');
  if (!ctx) return;

  if (chartOre) { chartOre.destroy(); }

  var labels = collabs.map(function(c) { return c.nome || c.username; });
  var ord = collabs.map(function(c) { return Number(c.tot_ordinario) || 0; });
  var strF = collabs.map(function(c) { return Number(c.tot_str_feriale) || 0; });
  var strFe = collabs.map(function(c) { return Number(c.tot_str_festivo) || 0; });
  var viag = collabs.map(function(c) { return Number(c.tot_viaggio) || 0; });

  chartOre = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Ordinario', data: ord, backgroundColor: '#4361ee' },
        { label: 'Str. Feriale', data: strF, backgroundColor: '#198754' },
        { label: 'Str. Festivo', data: strFe, backgroundColor: '#ffc107' },
        { label: 'Viaggio', data: viag, backgroundColor: '#0dcaf0' }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Ore' } }
      }
    }
  });
}

// ============================================================
// ESPORTAZIONE EXCEL RIEPILOGO
// ============================================================
function esportaRiepilogoExcel() {
  if (typeof XLSX === 'undefined') { alert('Errore: libreria Excel non caricata.'); return; }
  if (!RIEPILOGO_CACHE) { alert('Nessun dato da esportare.'); return; }
  var mese = $('riepilogoMese').value || new Date().toISOString().slice(0,7);
  var wb = XLSX.utils.book_new();

  var dataCollab = [
    ['Dipendente', 'Ordinario', 'Str. Feriale', 'Str. Festivo', 'Viaggio', 'Ferie (gg)', 'Malattia (gg)', 'Totale ore']
  ];
  (RIEPILOGO_CACHE.per_collaboratore || []).forEach(function(c) {
    dataCollab.push([
      c.nome || c.username,
      Number(c.tot_ordinario) || 0,
      Number(c.tot_str_feriale) || 0,
      Number(c.tot_str_festivo) || 0,
      Number(c.tot_viaggio) || 0,
      Number(c.giorni_ferie) || 0,
      Number(c.giorni_malattia) || 0,
      Number(c.tot_ore) || 0
    ]);
  });
  var ws1 = XLSX.utils.aoa_to_sheet(dataCollab);
  ws1['!cols'] = [{ wch: 25 }, { wch: 11 }, { wch: 13 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 13 }, { wch: 12 }];
  var range1 = XLSX.utils.decode_range(ws1['!ref']);
  for (var C = range1.s.c; C <= range1.e.c; ++C) {
    var addr1 = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws1[addr1]) ws1[addr1].s = { font: { bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { fgColor: { rgb: 'FF4361EE' } }, alignment: { horizontal: 'center' } };
  }
  XLSX.utils.book_append_sheet(wb, ws1, 'Per collaboratore');

  var dataComm = [
    ['Comm. Nr.', 'Committente', 'Cantiere', 'Ordinario', 'Straordinari', 'Viaggio', 'Totale ore']
  ];
  (RIEPILOGO_CACHE.per_commessa || []).forEach(function(c) {
    dataComm.push([
      c.numero_commessa || '-',
      c.cliente || '-',
      c.cantiere || '-',
      Number(c.tot_ordinario) || 0,
      Number(c.tot_straordinari) || 0,
      Number(c.tot_viaggio) || 0,
      Number(c.tot_ore) || 0
    ]);
  });
  var ws2 = XLSX.utils.aoa_to_sheet(dataComm);
  ws2['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 11 }, { wch: 14 }, { wch: 11 }, { wch: 12 }];
  var range2 = XLSX.utils.decode_range(ws2['!ref']);
  for (var C2 = range2.s.c; C2 <= range2.e.c; ++C2) {
    var addr2 = XLSX.utils.encode_cell({ r: 0, c: C2 });
    if (ws2[addr2]) ws2[addr2].s = { font: { bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { fgColor: { rgb: 'FF4361EE' } }, alignment: { horizontal: 'center' } };
  }
  XLSX.utils.book_append_sheet(wb, ws2, 'Per commessa');

  var tot = RIEPILOGO_CACHE.totali || {};
  var dataTot = [
    ['Periodo', mese],
    ['', ''],
    ['Ore ordinarie', Number(tot.tot_ordinario) || 0],
    ['Ore str. feriali', Number(tot.tot_str_feriale) || 0],
    ['Ore str. festive', Number(tot.tot_str_festivo) || 0],
    ['Ore viaggio', Number(tot.tot_viaggio) || 0],
    ['', ''],
    ['TOTALE ORE', Number(tot.tot_ore) || 0],
    ['Numero timbrature', Number(tot.num_timbrature) || 0],
    ['', ''],
    ['Dipendenti attivi', Number(RIEPILOGO_CACHE.num_dipendenti) || 0],
    ['Commesse', Number(RIEPILOGO_CACHE.num_commesse) || 0]
  ];
  var ws3 = XLSX.utils.aoa_to_sheet(dataTot);
  ws3['!cols'] = [{ wch: 22 }, { wch: 15 }];
  ['A1', 'A3', 'A4', 'A5', 'A6', 'A8', 'A9', 'A11', 'A12'].forEach(function(a) {
    if (ws3[a]) ws3[a].s = { font: { bold: true } };
  });
  if (ws3['B8']) ws3['B8'].s = { font: { bold: true, color: { rgb: 'FF4361EE' } } };
  XLSX.utils.book_append_sheet(wb, ws3, 'Totali');

  XLSX.writeFile(wb, 'riepilogo-' + mese + '.xlsx');
}
window.esportaRiepilogoExcel = esportaRiepilogoExcel;

// ============================================================
// LOGICA ADMIN
// ============================================================
if (PAGE === 'admin.html') {
  (function() {
    var token = null;
    try { token = localStorage.getItem('marcatempo_token'); } catch(e) {}
    if (!token) { window.location.href = 'index.html'; return; }

    callApi('/api/checkSession', { token: token }).then(function(res) {
      if (!res || !res.success || res.user.ruolo !== 'admin') {
        window.location.href = 'index.html';
        return;
      }
      APP.user = res.user;
      APP.token = token;
      show('viewAdmin');
      hide('viewLoading');
      $('adminUserName').textContent = APP.user.nome || APP.user.username;
      initAdmin();
    });

    function initAdmin() {
      $('filtroMeseAdmin').value = new Date().toISOString().slice(0,7);
      loadCommesse();
      loadTimbratureAdmin();
      loadUtenti();
      loadCollaboratoriPerAssegnazione();
      populateUtentiFilter('filtroUtente');
      initRiepilogo();

      $('filtroMeseAdmin').addEventListener('change', loadTimbratureAdmin);
      $('filtroUtente').addEventListener('change', function() { renderTimbratureTable('timbratureAdminList', true, 'admin'); });
      $('filtroCommessa').addEventListener('change', function() { renderTimbratureTable('timbratureAdminList', true, 'admin'); });
      $('filtroTipo').addEventListener('change', function() { renderTimbratureTable('timbratureAdminList', true, 'admin'); });
      $('filtroRicerca').addEventListener('input', function() { renderTimbratureTable('timbratureAdminList', true, 'admin'); });

      $('commessaForm').addEventListener('submit', function(e) {
        e.preventDefault();
        var form = this;
        var fd = new FormData(form);
        callApi('/api/commessa/insert', {
          numero_commessa: fd.get('numero_commessa'),
          cliente: fd.get('cliente'),
          cantiere: fd.get('cantiere'),
          descrizione: fd.get('descrizione') || ''
        }).then(function(r) {
          if (r && r.success) {
            showMessage('adminMessage', 'success', r.message);
            form.reset();
            loadCommesse();
            loadCollaboratoriPerAssegnazione();
          } else {
            showMessage('adminMessage', 'danger', (r && r.error) || 'Errore');
          }
        });
      });

      $('utenteForm').addEventListener('submit', function(e) {
        e.preventDefault();
        var form = this;
        var fd = new FormData(form);
        callApi('/api/utente/insert', {
          username: fd.get('username'),
          nome_completo: fd.get('nome_completo'),
          password: fd.get('password'),
          email: fd.get('email') || '',
          ruolo: fd.get('ruolo')
        }).then(function(r) {
          if (r && r.success) {
            showMessage('adminMessage', 'success', r.message);
            form.reset();
            loadUtenti();
            loadCollaboratoriPerAssegnazione();
            populateUtentiFilter('filtroUtente');
          } else {
            showMessage('adminMessage', 'danger', (r && r.error) || 'Errore');
          }
        });
      });

      $('assegnazioneCollaboratore').addEventListener('change', onCollaboratoreSelected);
    }

    function loadCommesse() {
      callApi('/api/commesse').then(function(r) {
        var tbody = $('commesseList');
        if (r && r.success) {
          COMMESSE_CACHE = r.data;
          populateCommesseFilter('filtroCommessa');

          if (r.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Nessuna commessa</td></tr>';
            return;
          }
          var html = '';
          r.data.forEach(function(c) {
            html += '<tr>' +
              '<td>' + c.id + '</td>' +
              '<td>' + escapeHtml(c.numero_commessa) + '</td>' +
              '<td>' + escapeHtml(c.cliente) + '</td>' +
              '<td>' + escapeHtml(c.cantiere || '') + '</td>' +
              '<td class="text-nowrap">' +
                '<button class="btn btn-sm btn-outline-primary me-1" title="Modifica" onclick="apriModificaCommessa(' + c.id + ')"><i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-sm btn-outline-danger" title="Elimina" onclick="eliminaCommessa(' + c.id + ')"><i class="bi bi-trash"></i></button>' +
              '</td>' +
              '</tr>';
          });
          tbody.innerHTML = html;
        }
      });
    }

    window.eliminaCommessa = function(id) {
      if (confirm('Eliminare questa commessa? Verranno eliminate anche le assegnazioni collegate.')) {
        callApi('/api/commessa/delete', { id: id }).then(function(r) {
          if (r && r.success) {
            showMessage('adminMessage', 'success', r.message);
            loadCommesse();
            loadCollaboratoriPerAssegnazione();
          }
        });
      }
    };

    function loadTimbratureAdmin() {
      var mese = $('filtroMeseAdmin').value || new Date().toISOString().slice(0,7);
      callApi('/api/timbrature', { mese: mese }).then(function(r) {
        if (r && r.success) {
          TIMBRATURE_CACHE = r.data;
          renderTimbratureTable('timbratureAdminList', true, 'admin');
        } else {
          $('timbratureAdminList').innerHTML = '<tr><td colspan="15" class="text-center text-danger py-3">' + ((r && r.error) || 'Errore') + '</td></tr>';
        }
      });
    }
    window.loadTimbratureAdmin = loadTimbratureAdmin;

    window.eliminaTimbratura = function(id) {
      if (confirm('Eliminare questa timbratura?')) {
        callApi('/api/timbratura/delete', { id: id }).then(function(r) {
          if (r && r.success) {
            showMessage('adminMessage', 'success', r.message);
            loadTimbratureAdmin();
          }
        });
      }
    };

    function loadUtenti() {
      callApi('/api/utenti').then(function(r) {
        var tbody = $('utentiList');
        if (r && r.success) {
          if (r.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Nessun utente</td></tr>';
            return;
          }
          var html = '';
          r.data.forEach(function(u) {
            var badge = u.ruolo === 'admin' ? 'bg-danger' : 'bg-primary';
            var actions = '<button class="btn btn-sm btn-outline-primary me-1" title="Modifica" onclick="apriModificaUtente(' + u.id + ')"><i class="bi bi-pencil"></i></button>';
            if (String(u.id) !== String(APP.user.id)) {
              actions += '<button class="btn btn-sm btn-outline-danger" title="Elimina" onclick="eliminaUtente(' + u.id + ')"><i class="bi bi-trash"></i></button>';
            }
            html += '<tr>' +
              '<td>' + u.id + '</td>' +
              '<td>' + escapeHtml(u.username) + '</td>' +
              '<td>' + escapeHtml(u.nome_completo || '') + '</td>' +
              '<td><span class="badge ' + badge + '">' + escapeHtml(u.ruolo) + '</span></td>' +
              '<td class="text-nowrap">' + actions + '</td>' +
              '</tr>';
          });
          tbody.innerHTML = html;
        }
      });
    }

    window.eliminaUtente = function(id) {
      if (confirm('Eliminare questo utente? Verranno eliminate anche le sue timbrature, assegnazioni e sessioni.')) {
        callApi('/api/utente/delete', { id: id }).then(function(r) {
          if (r && r.success) {
            showMessage('adminMessage', 'success', r.message);
            loadUtenti();
            loadCollaboratoriPerAssegnazione();
            populateUtentiFilter('filtroUtente');
          }
        });
      }
    };

    function loadCollaboratoriPerAssegnazione() {
      callApi('/api/utenti').then(function(r) {
        if (r && r.success) {
          var sel = $('assegnazioneCollaboratore');
          var current = sel.value;
          sel.innerHTML = '<option value="">Seleziona collaboratore...</option>';
          r.data.filter(function(u) { return u.ruolo === 'collaboratore'; }).forEach(function(u) {
            sel.innerHTML += '<option value="' + u.id + '">' + escapeHtml(u.username) + ' - ' + escapeHtml(u.nome_completo || '') + '</option>';
          });
          sel.value = current;
        }
      });
    }

    function onCollaboratoreSelected() {
      var userId = $('assegnazioneCollaboratore').value;
      if (!userId) { hide('assegnazioneBox'); return; }
      show('assegnazioneBox');

      callApi('/api/utenti').then(function(r) {
        if (r && r.success) {
          var u = r.data.find(function(x) { return String(x.id) === String(userId); });
          if (u) $('assegnazioneNome').textContent = u.nome_completo || u.username;
        }
      });

      var allCommesse = null;
      var userAssegnazioni = null;

      callApi('/api/commesse').then(function(r) {
        if (r && r.success) { allCommesse = r.data; render(); }
      });

      callApi('/api/assegnazioni', { id_utente: userId }).then(function(r) {
        if (r && r.success) {
          userAssegnazioni = r.data.map(function(a) { return String(a.id_commessa); });
          render();
        }
      });

      function render() {
        if (allCommesse === null || userAssegnazioni === null) return;
        var container = $('assegnazioneCommesseList');
        if (allCommesse.length === 0) {
          container.innerHTML = '<div class="col-12 text-muted">Nessuna commessa disponibile.</div>';
          return;
        }
        var html = '';
        allCommesse.forEach(function(c) {
          var checked = userAssegnazioni.indexOf(String(c.id)) >= 0 ? 'checked' : '';
          html += '<div class="col-md-4 col-12">' +
            '<div class="form-check border rounded p-2 ps-4">' +
            '<input class="form-check-input" type="checkbox" value="' + c.id + '" id="comm_chk_' + c.id + '" ' + checked + '>' +
            '<label class="form-check-label w-100" for="comm_chk_' + c.id + '">' +
            '<strong>' + escapeHtml(c.numero_commessa) + '</strong> - ' + escapeHtml(c.cliente) +
            '<br><small class="text-muted">' + escapeHtml(c.cantiere || '') + '</small>' +
            '</label>' +
            '</div></div>';
        });
        container.innerHTML = html;
      }
    }

    window.salvaAssegnazioni = function() {
      var userId = $('assegnazioneCollaboratore').value;
      if (!userId) return;
      var checks = document.querySelectorAll('#assegnazioneCommesseList input[type=checkbox]');
      var idCommesse = [];
      checks.forEach(function(chk) { if (chk.checked) idCommesse.push(parseInt(chk.value)); });
      var btn = event.target;
      var original = btn.innerHTML;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvataggio...';
      btn.disabled = true;
      callApi('/api/assegnazioni/set', { id_utente: parseInt(userId), id_commesse: idCommesse }).then(function(r) {
        if (r && r.success) showMessage('adminMessage', 'success', r.message);
        else showMessage('adminMessage', 'danger', (r && r.error) || 'Errore');
        btn.innerHTML = original;
        btn.disabled = false;
      });
    };
  })();
}

// ============================================================
// LOGICA COLLABORATORE
// ============================================================
if (PAGE === 'collaboratore.html') {
  (function() {
    var token = null;
    try { token = localStorage.getItem('marcatempo_token'); } catch(e) {}
    if (!token) { window.location.href = 'index.html'; return; }

    callApi('/api/checkSession', { token: token }).then(function(res) {
      if (!res || !res.success || res.user.ruolo !== 'collaboratore') {
        window.location.href = 'index.html';
        return;
      }
      APP.user = res.user;
      APP.token = token;
      show('viewCollab');
      hide('viewLoading');
      $('collabUserName').textContent = APP.user.nome || APP.user.username;
      initCollab();
    });

    function initCollab() {
      $('filtroMese').value = new Date().toISOString().slice(0,7);
      loadCommesseForCollab();
      loadOggi();
      loadTimbratureCollab();

      $('filtroMese').addEventListener('change', loadTimbratureCollab);
      $('filtroCommessa').addEventListener('change', function() { renderTimbratureTable('timbratureList', false, 'collab'); });
      $('filtroTipo').addEventListener('change', function() { renderTimbratureTable('timbratureList', false, 'collab'); });
      $('filtroRicerca').addEventListener('input', function() { renderTimbratureTable('timbratureList', false, 'collab'); });

      var form = $('timbraturaForm');
      ['ore_ordinarie', 'ore_straord_festive', 'ore_straord_feriali'].forEach(function(name) {
        var input = form.querySelector('[name=' + name + ']');
        if (input) input.addEventListener('input', aggiornaAvvisoOre);
      });

      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var fd = new FormData(form);
        var oreOrd = parseFloat(fd.get('ore_ordinarie')) || 0;
        var oreStrF = parseFloat(fd.get('ore_straord_feriali')) || 0;
        var oreStrFe = parseFloat(fd.get('ore_straord_festive')) || 0;
        var check = validaOre(oreOrd, oreStrF, oreStrFe);
        if (!check.ok) { showMessage('collabMessage', 'danger', check.error); return; }

        var data = {
          id_utente: APP.user.id,
          data_lavoro: new Date().toISOString().split('T')[0],
          id_commessa: parseInt(fd.get('id_commessa')),
          ore_ordinarie: oreOrd,
          ore_straord_festive: oreStrFe,
          ore_straord_feriali: oreStrF,
          ore_viaggio: parseFloat(fd.get('ore_viaggio')) || 0,
          ferie: fd.get('ferie') === 'on',
          malattia: fd.get('malattia') === 'on',
          note: fd.get('note') || ''
        };

        var btn = form.querySelector('button[type=submit]');
        var orig = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvataggio...';
        btn.disabled = true;

        callApi('/api/timbratura/insert', data).then(function(r) {
          if (r && r.success) {
            showMessage('collabMessage', 'success', r.message);
            form.reset();
            aggiornaAvvisoOre();
            loadOggi();
            loadTimbratureCollab();
          } else {
            showMessage('collabMessage', 'danger', (r && r.error) || 'Errore');
          }
          btn.innerHTML = orig;
          btn.disabled = false;
        });
      });

      aggiornaAvvisoOre();
    }

    function aggiornaAvvisoOre() {
      var form = $('timbraturaForm');
      if (!form) return;
      var oreOrd = parseFloat(form.querySelector('[name=ore_ordinarie]').value) || 0;
      var oreStrF = parseFloat(form.querySelector('[name=ore_straord_feriali]').value) || 0;
      var oreStrFe = parseFloat(form.querySelector('[name=ore_straord_festive]').value) || 0;
      var check = validaOre(oreOrd, oreStrF, oreStrFe);

      var el = $('avvisoOre');
      if (!el) {
        el = document.createElement('div');
        el.id = 'avvisoOre';
        el.className = 'col-12';
        var btnContainer = form.querySelector('.col-12:last-child');
        form.insertBefore(el, btnContainer);
      }
      if (!check.ok) {
        el.innerHTML = '<div class="alert alert-warning py-2 mb-0"><i class="bi bi-exclamation-triangle me-1"></i>' + check.error + '</div>';
      } else {
        var tot = oreOrd + oreStrF + oreStrFe;
        if (tot > 0) {
          el.innerHTML = '<div class="alert alert-info py-2 mb-0"><i class="bi bi-info-circle me-1"></i>Totale ore del giorno: <b>' + tot.toFixed(1) + '</b> (max 14)</div>';
        } else {
          el.innerHTML = '';
        }
      }
    }

    function loadCommesseForCollab() {
      callApi('/api/mieCommesse', { idUtente: APP.user.id }).then(function(r) {
        if (r && r.success) {
          COMMESSE_CACHE = r.data;
          var sel = $('commessa');
          if (r.data.length === 0) {
            sel.innerHTML = '<option value="">Nessuna commessa assegnata.</option>';
            return;
          }
          sel.innerHTML = '<option value="">Seleziona commessa...</option>';
          r.data.forEach(function(c) {
            sel.innerHTML += '<option value="' + c.id + '">' + escapeHtml(c.numero_commessa) + ' - ' + escapeHtml(c.cliente) + '</option>';
          });
          populateCommesseFilter('filtroCommessa');
        }
      });
    }

    function loadOggi() {
      var oggi = new Date().toISOString().split('T')[0];
      callApi('/api/timbrature', { id_utente: APP.user.id }).then(function(r) {
        if (r && r.success) {
          var ord = 0, strF = 0, strFe = 0, viag = 0;
          r.data.filter(function(t) { return t.data_lavoro === oggi; }).forEach(function(t) {
            ord += Number(t.ore_ordinarie) || 0;
            strF += Number(t.ore_straord_feriali) || 0;
            strFe += Number(t.ore_straord_festive) || 0;
            viag += Number(t.ore_viaggio) || 0;
          });
          $('oreOrd').textContent = ord.toFixed(1);
          $('oreStr').textContent = (strF + strFe).toFixed(1);
          $('oreViag').textContent = viag.toFixed(1);
          $('oreTot').textContent = (ord + strF + strFe + viag).toFixed(1);
        }
      });
    }

    function loadTimbratureCollab() {
      var mese = $('filtroMese').value || new Date().toISOString().slice(0,7);
      callApi('/api/timbrature', { id_utente: APP.user.id, mese: mese }).then(function(r) {
        if (r && r.success) {
          TIMBRATURE_CACHE = r.data;
          renderTimbratureTable('timbratureList', false, 'collab');
        } else {
          $('timbratureList').innerHTML = '<tr><td colspan="15" class="text-center text-danger py-3">' + ((r && r.error) || 'Errore') + '</td></tr>';
        }
      });
    }
  })();
}

// ============================================================
// ESPORTAZIONE EXCEL TIMBRATURE
// ============================================================
function esportaExcel(context) {
  if (typeof XLSX === 'undefined') { alert('Errore: libreria Excel non caricata.'); return; }

  var mese, filename, sheetName;
  var filtered;

  if (context === 'admin') {
    filtered = applyFiltri(TIMBRATURE_CACHE, 'admin');
    mese = $('filtroMeseAdmin').value || new Date().toISOString().slice(0,7);
    filename = 'timbrature-admin-' + mese + '.xlsx';
    sheetName = 'Timbrature';
  } else {
    filtered = applyFiltri(TIMBRATURE_CACHE, 'collab');
    mese = $('filtroMese').value || new Date().toISOString().slice(0,7);
    var nomeUtente = (APP.user.nome || APP.user.username || 'utente').replace(/\s+/g, '-').toLowerCase();
    filename = 'timbrature-' + nomeUtente + '-' + mese + '.xlsx';
    sheetName = 'Le mie timbrature';
  }

  if (filtered.length === 0) { alert('Nessun dato da esportare con i filtri attivi.'); return; }

  var data = [];
  filtered.forEach(function(t) {
    var tot = (Number(t.ore_ordinarie)||0) + (Number(t.ore_straord_feriali)||0) + (Number(t.ore_straord_festive)||0);
    var nomeDip = context === 'admin' ? (t.nome_utente || '-') : ((APP.user.nome || APP.user.username) || '-');
    data.push([
      t.data_lavoro || '-', nomeDip,
      Number(t.ore_ordinarie) || 0, Number(t.ore_straord_feriali) || 0, Number(t.ore_straord_festive) || 0,
      tot, Number(t.ore_viaggio) || 0,
      t.numero_commessa || '-', t.cliente || '-', t.cantiere || '-',
      t.note || '', t.ferie ? 'Si' : '', t.malattia ? 'Si' : ''
    ]);
  });

  var headers = ['Data', 'Nome del dipendente', 'Ordinario', 'Straord. Feriale', 'Straord. Festivo', 'Totale', 'Ore Viaggio', 'Comm. Nr.', 'Committente', 'Cantiere', 'Note', 'Ferie', 'Malattia'];
  var ws = XLSX.utils.aoa_to_sheet([headers].concat(data));
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 11 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 40 }, { wch: 8 }, { wch: 10 }];
  var range = XLSX.utils.decode_range(ws['!ref']);
  for (var C = range.s.c; C <= range.e.c; ++C) {
    var addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[addr]) ws[addr].s = { font: { bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { fgColor: { rgb: 'FF4361EE' } }, alignment: { horizontal: 'center' } };
  }
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  var totOrd = 0, totStrF = 0, totStrFe = 0, totTot = 0, totViag = 0;
  data.forEach(function(row) {
    totOrd += row[2]; totStrF += row[3]; totStrFe += row[4]; totTot += row[5]; totViag += row[6];
  });
  var ws2 = XLSX.utils.aoa_to_sheet([
    ['Riepilogo', ''], ['Periodo', mese], ['Totale righe', data.length], ['', ''],
    ['Ordinario', totOrd], ['Straord. Feriale', totStrF], ['Straord. Festivo', totStrFe],
    ['Ore Viaggio', totViag], ['', ''], ['TOTALE ORE', totTot]
  ]);
  ws2['!cols'] = [{ wch: 22 }, { wch: 15 }];
  ['A1', 'A5', 'A6', 'A7', 'A8', 'A10'].forEach(function(addr) { if (ws2[addr]) ws2[addr].s = { font: { bold: true } }; });
  if (ws2['B10']) ws2['B10'].s = { font: { bold: true, color: { rgb: 'FF4361EE' } } };
  XLSX.utils.book_append_sheet(wb, ws2, 'Riepilogo');

  XLSX.writeFile(wb, filename);
}
window.esportaExcel = esportaExcel;

// ============================================================
// BANNER INSTALLAZIONE PWA
// ============================================================
var deferredInstallPrompt = null;

// Intercetta l'evento di installazione
window.addEventListener('beforeinstallprompt', function(e) {
  console.log('[PWA] beforeinstallprompt fired');
  e.preventDefault();
  deferredInstallPrompt = e;

  // Controlla se l'utente ha già rifiutato di recente
  var snooze = localStorage.getItem('pwa_snooze_until');
  if (snooze && Date.now() < Number(snooze)) {
    console.log('[PWA] Banner in snooze fino a', new Date(Number(snooze)));
    return;
  }

  showInstallBanner();
});

// Mostra il banner
function showInstallBanner() {
  var banner = document.getElementById('pwaInstallBanner');
  if (!banner) {
    createInstallBanner();
    banner = document.getElementById('pwaInstallBanner');
  }
  if (banner) {
    setTimeout(function() {
      banner.classList.add('show');
    }, 2000);
  }
}

// Crea il banner dinamicamente
function createInstallBanner() {
  if (document.getElementById('pwaInstallBanner')) return;

  var banner = document.createElement('div');
  banner.id = 'pwaInstallBanner';
  banner.innerHTML = '' +
    '<div class="pwa-banner-content">' +
      '<div class="pwa-banner-icon">' +
        '<img src="icon-192.png" alt="Marcatempo">' +
      '</div>' +
      '<div class="pwa-banner-text">' +
        '<strong>Installa Marcatempo</strong>' +
        '<small>Aggiungila alla schermata Home per un accesso più veloce</small>' +
      '</div>' +
      '<div class="pwa-banner-actions">' +
        '<button type="button" class="pwa-btn-install" onclick="installPWA()">' +
          '<i class="bi bi-download"></i> Installa' +
        '</button>' +
        '<button type="button" class="pwa-btn-dismiss" onclick="dismissInstallBanner()" title="Chiudi">' +
          '<i class="bi bi-x-lg"></i>' +
        '</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(banner);
}

// Installa l'app
function installPWA() {
  if (!deferredInstallPrompt) {
    alert('Per installare l\'app usa il menu del browser (⋮) → "Installa app"');
    return;
  }

  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(function(choiceResult) {
    console.log('[PWA] Scelta utente:', choiceResult.outcome);

    if (choiceResult.outcome === 'accepted') {
      console.log('[PWA] Utente ha accettato l\'installazione');
      hideInstallBanner();
    } else {
      console.log('[PWA] Utente ha rifiutato l\'installazione');
      // Snooze per 7 giorni
      var snoozeUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
      try {
        localStorage.setItem('pwa_snooze_until', String(snoozeUntil));
      } catch(e) {}
      hideInstallBanner();
    }
    deferredInstallPrompt = null;
  });
}
window.installPWA = installPWA;

// Nascondi il banner
function dismissInstallBanner() {
  // Snooze per 7 giorni
  var snoozeUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
  try {
    localStorage.setItem('pwa_snooze_until', String(snoozeUntil));
  } catch(e) {}
  hideInstallBanner();
}
window.dismissInstallBanner = dismissInstallBanner;

function hideInstallBanner() {
  var banner = document.getElementById('pwaInstallBanner');
  if (banner) {
    banner.classList.remove('show');
    setTimeout(function() {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }, 400);
  }
}

// Nascondi il banner se l'app viene installata
window.addEventListener('appinstalled', function() {
  console.log('[PWA] App installata!');
  hideInstallBanner();
  try { localStorage.removeItem('pwa_snooze_until'); } catch(e) {}
});
