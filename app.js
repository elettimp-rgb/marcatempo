// ============================================================
// CONFIGURAZIONE
// ============================================================
const API_URL = 'https://marcatempo-api.elettimp.workers.dev';

// ============================================================
// STATO GLOBALE
// ============================================================
var APP = { user: null, token: null };
var TIMBRATURE_CACHE = [];   // dati grezzi caricati dal server
var COMMESSE_CACHE = [];     // per popolare i filtri dropdown

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
// RENDER RIGHE CON FILTRI
// ============================================================
function renderTimbratureTable(tbodyId, showUser, context) {
  var tbody = $(tbodyId);
  if (!tbody) return;

  var filtered = applyFiltri(TIMBRATURE_CACHE, context);

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14" class="text-center text-muted py-3">Nessuna timbratura trovata con i filtri attivi</td></tr>';
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
    // Filtro utente (solo admin)
    if (fUtente && String(t.id_utente) !== String(fUtente)) return false;

    // Filtro commessa
    if (fCommessa && String(t.id_commessa) !== String(fCommessa)) return false;

    // Filtro tipo
    if (fTipo === 'ferie' && !t.ferie) return false;
    if (fTipo === 'malattia' && !t.malattia) return false;
    if (fTipo === 'straordinari') {
      var str = (Number(t.ore_straord_festive)||0) + (Number(t.ore_straord_feriali)||0);
      if (str <= 0) return false;
    }
    if (fTipo === 'viaggio' && (Number(t.ore_viaggio)||0) <= 0) return false;

    // Ricerca testo (note + cliente + commessa + cantiere)
    if (fRicerca) {
      var searchIn = [
        t.note || '',
        t.cliente || '',
        t.numero_commessa || '',
        t.cantiere || '',
        t.nome_utente || ''
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

  if (context === 'admin') {
    loadTimbratureAdmin();
  } else {
    loadTimbratureCollab();
  }
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
// COSTRUZIONE RIGA (condivisa)
// ============================================================
function buildRow(t, showUser) {
  var tot = (Number(t.ore_ordinarie)||0) + (Number(t.ore_straord_feriali)||0) + (Number(t.ore_straord_festive)||0);
  var ferie = t.ferie ? '<span class="badge bg-info">Sì</span>' : '<span class="text-muted">—</span>';
  var malattia = t.malattia ? '<span class="badge bg-warning text-dark">Sì</span>' : '<span class="text-muted">—</span>';
  var noteFull = escapeHtml(t.note || '');
  var note = noteFull ? '<span title="' + noteFull + '">' + noteFull.substring(0, 40) + (noteFull.length > 40 ? '…' : '') + '</span>' : '<span class="text-muted">—</span>';

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
  if (showUser) {
    html += '<td class="text-nowrap"><button class="btn btn-sm btn-outline-danger" onclick="eliminaTimbratura(' + t.id + ')"><i class="bi bi-trash"></i></button></td>';
  } else {
    html += '<td></td>';
  }
  html += '</tr>';
  return html;
}

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

      // Popola filtri
      populateUtentiFilter('filtroUtente');

      // Event listeners filtri
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
              '<td><button class="btn btn-sm btn-outline-danger" onclick="eliminaCommessa(' + c.id + ')"><i class="bi bi-trash"></i></button></td>' +
              '</tr>';
          });
          tbody.innerHTML = html;
        }
      });
    }

    window.eliminaCommessa = function(id) {
      if (confirm('Eliminare questa commessa?')) {
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
          var tbody = $('timbratureAdminList');
          tbody.innerHTML = '<tr><td colspan="14" class="text-center text-danger py-3">' + ((r && r.error) || 'Errore') + '</td></tr>';
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
            var action = (String(u.id) !== String(APP.user.id))
              ? '<button class="btn btn-sm btn-outline-danger" onclick="eliminaUtente(' + u.id + ')"><i class="bi bi-trash"></i></button>'
              : '<span class="text-muted small">— tu —</span>';
            html += '<tr>' +
              '<td>' + u.id + '</td>' +
              '<td>' + escapeHtml(u.username) + '</td>' +
              '<td>' + escapeHtml(u.nome_completo || '') + '</td>' +
              '<td><span class="badge ' + badge + '">' + escapeHtml(u.ruolo) + '</span></td>' +
              '<td>' + action + '</td>' +
              '</tr>';
          });
          tbody.innerHTML = html;
        }
      });
    }

    window.eliminaUtente = function(id) {
      if (confirm('Eliminare questo utente?')) {
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
            sel.innerHTML += '<option value="' + u.id + '">' + escapeHtml(u.username) + ' — ' + escapeHtml(u.nome_completo || '') + '</option>';
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
            '<strong>' + escapeHtml(c.numero_commessa) + '</strong> — ' + escapeHtml(c.cliente) +
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

      // Event listeners filtri
      $('filtroMese').addEventListener('change', loadTimbratureCollab);
      $('filtroCommessa').addEventListener('change', function() { renderTimbratureTable('timbratureList', false, 'collab'); });
      $('filtroTipo').addEventListener('change', function() { renderTimbratureTable('timbratureList', false, 'collab'); });
      $('filtroRicerca').addEventListener('input', function() { renderTimbratureTable('timbratureList', false, 'collab'); });

      $('timbraturaForm').addEventListener('submit', function(e) {
        e.preventDefault();
        var form = this;
        var fd = new FormData(form);
        var data = {
          id_utente: APP.user.id,
          data_lavoro: new Date().toISOString().split('T')[0],
          id_commessa: parseInt(fd.get('id_commessa')),
          ore_ordinarie: parseFloat(fd.get('ore_ordinarie')) || 0,
          ore_straord_festive: parseFloat(fd.get('ore_straord_festive')) || 0,
          ore_straord_feriali: parseFloat(fd.get('ore_straord_feriali')) || 0,
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
            loadOggi();
            loadTimbratureCollab();
          } else {
            showMessage('collabMessage', 'danger', (r && r.error) || 'Errore');
          }
          btn.innerHTML = orig;
          btn.disabled = false;
        });
      });
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
          r.data
            .filter(function(t) { return t.data_lavoro === oggi; })
            .forEach(function(t) {
              ord   += Number(t.ore_ordinarie) || 0;
              strF  += Number(t.ore_straord_feriali) || 0;
              strFe += Number(t.ore_straord_festive) || 0;
              viag  += Number(t.ore_viaggio) || 0;
            });
          $('oreOrd').textContent   = ord.toFixed(1);
          $('oreStr').textContent   = (strF + strFe).toFixed(1);
          $('oreViag').textContent  = viag.toFixed(1);
          $('oreTot').textContent   = (ord + strF + strFe + viag).toFixed(1);
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
          var tbody = $('timbratureList');
          tbody.innerHTML = '<tr><td colspan="14" class="text-center text-danger py-3">' + ((r && r.error) || 'Errore') + '</td></tr>';
        }
      });
    }
  })();
}

// ============================================================
// ESPORTAZIONE EXCEL
// ============================================================
window.esportaExcel = function(context) {
  if (typeof XLSX === 'undefined') {
    alert('Errore: libreria Excel non caricata. Ricarica la pagina.');
    return;
  }

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

  if (filtered.length === 0) {
    alert('Nessun dato da esportare con i filtri attivi.');
    return;
  }

  var data = [];
  filtered.forEach(function(t) {
    var tot = (Number(t.ore_ordinarie)||0) + (Number(t.ore_straord_feriali)||0) + (Number(t.ore_straord_festive)||0);
    var nomeDip = context === 'admin' ? (t.nome_utente || '-') : ((APP.user.nome || APP.user.username) || '-');
    data.push([
      t.data_lavoro || '-',
      nomeDip,
      Number(t.ore_ordinarie) || 0,
      Number(t.ore_straord_feriali) || 0,
      Number(t.ore_straord_festive) || 0,
      tot,
      Number(t.ore_viaggio) || 0,
      t.numero_commessa || '-',
      t.cliente || '-',
      t.cantiere || '-',
      t.note || '',
      t.ferie ? 'Sì' : '',
      t.malattia ? 'Sì' : ''
    ]);
  });

  var headers = ['Data', 'Nome del dipendente', 'Ordinario', 'Straord. Feriale', 'Straord. Festivo', 'Totale', 'Ore Viaggio', 'Comm. Nr.', 'Committente', 'Cantiere', 'Note', 'Ferie', 'Malattia'];

  var wsData = [headers].concat(data);
  var ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 12 }, { wch: 22 }, { wch: 11 }, { wch: 15 }, { wch: 15 },
    { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 22 },
    { wch: 40 }, { wch: 8 }, { wch: 10 }
  ];

  var range = XLSX.utils.decode_range(ws['!ref']);
  for (var C = range.s.c; C <= range.e.c; ++C) {
    var addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[addr]) continue;
    ws[addr].s = {
      font: { bold: true, color: { rgb: 'FFFFFFFF' } },
      fill: { fgColor: { rgb: 'FF4361EE' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };
  }

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  var totOrd = 0, totStrF = 0, totStrFe = 0, totTot = 0, totViag = 0;
  data.forEach(function(row) {
    totOrd   += row[2];
    totStrF  += row[3];
    totStrFe += row[4];
    totTot   += row[5];
    totViag  += row[6];
  });

  var riepilogoData = [
    ['Riepilogo', ''],
    ['Periodo', mese],
    ['Totale righe', data.length],
    ['', ''],
    ['Ordinario', totOrd],
    ['Straord. Feriale', totStrF],
    ['Straord. Festivo', totStrFe],
    ['Ore Viaggio', totViag],
    ['', ''],
    ['TOTALE ORE', totTot]
  ];
  var ws2 = XLSX.utils.aoa_to_sheet(riepilogoData);
  ws2['!cols'] = [{ wch: 22 }, { wch: 15 }];
  ['A1', 'A5', 'A6', 'A7', 'A8', 'A10'].forEach(function(addr) {
    if (ws2[addr]) ws2[addr].s = { font: { bold: true } };
  });
  if (ws2['B10']) ws2['B10'].s = { font: { bold: true, color: { rgb: 'FF4361EE' } } };

  XLSX.utils.book_append_sheet(wb, ws2, 'Riepilogo');

  XLSX.writeFile(wb, filename);
};
