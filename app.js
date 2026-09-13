// ============================================================
// CONFIGURAZIONE
// ============================================================
const API_URL = 'https://marcatempo-api.elettimp.workers.dev';

// ============================================================
// STATO GLOBALE
// ============================================================
var APP = { user: null, token: null };

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
  if (APP.token) {
    callApi('/api/logout', { token: APP.token });
  }
  try { localStorage.removeItem('marcatempo_token'); } catch(e) {}
  APP.user = null;
  APP.token = null;
  window.location.href = 'logout.html';
}

// ============================================================
// RILEVA PAGINA CORRENTE
// ============================================================
var PAGE = window.location.pathname.split('/').pop() || 'index.html';
if (PAGE === '' || PAGE === '/') PAGE = 'index.html';

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
      
      $('filtroMeseAdmin').addEventListener('change', loadTimbratureAdmin);
      
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
        var tbody = $('timbratureAdminList');
        if (r && r.success) {
          if (r.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-3">Nessuna timbratura</td></tr>';
            return;
          }
          var html = '';
          r.data.forEach(function(t) {
            var tot = (Number(t.ore_ordinarie)||0) + (Number(t.ore_straord_festive)||0) + (Number(t.ore_straord_feriali)||0) + (Number(t.ore_viaggio)||0);
            var ferie = t.ferie ? '<span class="badge bg-info">Sì</span>' : '<span class="text-muted">—</span>';
            var malattia = t.malattia ? '<span class="badge bg-warning text-dark">Sì</span>' : '<span class="text-muted">—</span>';
            var noteFull = escapeHtml(t.note || '');
            var note = noteFull ? '<span title="' + noteFull + '">' + noteFull.substring(0, 40) + (noteFull.length > 40 ? '…' : '') + '</span>' : '<span class="text-muted">—</span>';
            html += '<tr>' +
              '<td>' + (t.data_lavoro || '-') + '</td>' +
              '<td>' + escapeHtml(t.nome_utente || '-') + '</td>' +
              '<td>' + escapeHtml(t.numero_commessa || '-') + '</td>' +
              '<td>' + (t.ore_ordinarie || 0) + '</td>' +
              '<td>' + ((Number(t.ore_straord_festive)||0) + (Number(t.ore_straord_feriali)||0)) + '</td>' +
              '<td>' + (t.ore_viaggio || 0) + '</td>' +
              '<td><strong>' + tot + '</strong></td>' +
              '<td>' + ferie + '</td>' +
              '<td>' + malattia + '</td>' +
              '<td>' + note + '</td>' +
              '<td class="text-nowrap"><button class="btn btn-sm btn-outline-danger" onclick="eliminaTimbratura(' + t.id + ')"><i class="bi bi-trash"></i></button></td>' +
              '</tr>';
          });
          tbody.innerHTML = html;
        }
      });
    }
    
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
      
      $('filtroMese').addEventListener('change', loadTimbratureCollab);
      
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
          var sel = $('commessa');
          if (r.data.length === 0) {
            sel.innerHTML = '<option value="">Nessuna commessa assegnata.</option>';
            return;
          }
          sel.innerHTML = '<option value="">Seleziona commessa...</option>';
          r.data.forEach(function(c) {
            sel.innerHTML += '<option value="' + c.id + '">' + escapeHtml(c.numero_commessa) + ' - ' + escapeHtml(c.cliente) + '</option>';
          });
        }
      });
    }
    
    function loadOggi() {
      var oggi = new Date().toISOString().split('T')[0];
      callApi('/api/timbrature', { id_utente: APP.user.id }).then(function(r) {
        if (r && r.success) {
          var ord = 0, str = 0, viag = 0;
          r.data
            .filter(function(t) { return t.data_lavoro === oggi; })
            .forEach(function(t) {
              ord += Number(t.ore_ordinarie) || 0;
              str += (Number(t.ore_straord_festive) || 0) + (Number(t.ore_straord_feriali) || 0);
              viag += Number(t.ore_viaggio) || 0;
            });
          $('oreOrd').textContent = ord.toFixed(1);
          $('oreStr').textContent = str.toFixed(1);
          $('oreViag').textContent = viag.toFixed(1);
          $('oreTot').textContent = (ord + str + viag).toFixed(1);
        }
      });
    }
    
    function loadTimbratureCollab() {
      var mese = $('filtroMese').value || new Date().toISOString().slice(0,7);
      callApi('/api/timbrature', { id_utente: APP.user.id, mese: mese }).then(function(r) {
        var tbody = $('timbratureList');
        if (r && r.success) {
          if (r.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-3">Nessuna timbratura</td></tr>';
            return;
          }
          var html = '';
          r.data.forEach(function(t) {
            var tot = (Number(t.ore_ordinarie)||0) + (Number(t.ore_straord_festive)||0) + (Number(t.ore_straord_feriali)||0) + (Number(t.ore_viaggio)||0);
            var ferie = t.ferie ? '<span class="badge bg-info">Sì</span>' : '<span class="text-muted">—</span>';
            var malattia = t.malattia ? '<span class="badge bg-warning text-dark">Sì</span>' : '<span class="text-muted">—</span>';
            var noteFull = escapeHtml(t.note || '');
            var note = noteFull ? '<span title="' + noteFull + '">' + noteFull.substring(0, 40) + (noteFull.length > 40 ? '…' : '') + '</span>' : '<span class="text-muted">—</span>';
            html += '<tr>' +
              '<td>' + (t.data_lavoro || '-') + '</td>' +
              '<td>' + escapeHtml(t.numero_commessa || '-') + '</td>' +
              '<td>' + escapeHtml(t.cliente || '-') + '</td>' +
              '<td>' + (t.ore_ordinarie || 0) + '</td>' +
              '<td>' + ((Number(t.ore_straord_festive)||0) + (Number(t.ore_straord_feriali)||0)) + '</td>' +
              '<td>' + (t.ore_viaggio || 0) + '</td>' +
              '<td><strong>' + tot + '</strong></td>' +
              '<td>' + ferie + '</td>' +
              '<td>' + malattia + '</td>' +
              '<td>' + note + '</td>' +
              '<td></td>' +
              '</tr>';
          });
          tbody.innerHTML = html;
        }
      });
    }
  })();
}


// ============================================================
// ESPORTAZIONE EXCEL (.xlsx)
// ============================================================
window.esportaExcel = function(context) {
  // Verifica che SheetJS sia caricato
  if (typeof XLSX === 'undefined') {
    alert('Errore: libreria Excel non caricata. Ricarica la pagina.');
    return;
  }

  // Leggi i dati dalla tabella HTML
  var data = [];
  var headers = [];
  var mese, filename, sheetName;

  if (context === 'admin') {
    var tbody = document.getElementById('timbratureAdminList');
    if (!tbody) return;

    // Intestazioni
    headers = ['Data', 'Utente', 'Commessa', 'Ordinarie', 'Straordinarie', 'Viaggio', 'Totale', 'Ferie', 'Malattia', 'Note'];

    // Righe
    var trs = tbody.querySelectorAll('tr');
    trs.forEach(function(tr) {
      var tds = tr.querySelectorAll('td');
      if (tds.length < 11) return; // salta riga "caricamento" o "nessuna"
      data.push([
        tds[0].textContent.trim(),
        tds[1].textContent.trim(),
        tds[2].textContent.trim(),
        parseFloat(tds[3].textContent.trim()) || 0,
        parseFloat(tds[4].textContent.trim()) || 0,
        parseFloat(tds[5].textContent.trim()) || 0,
        parseFloat(tds[6].textContent.trim()) || 0,
        tds[7].textContent.trim(),
        tds[8].textContent.trim(),
        tds[9].textContent.trim()
      ]);
    });

    mese = document.getElementById('filtroMeseAdmin').value || new Date().toISOString().slice(0,7);
    filename = 'timbrature-admin-' + mese + '.xlsx';
    sheetName = 'Timbrature';

  } else {
    var tbody = document.getElementById('timbratureList');
    if (!tbody) return;

    headers = ['Data', 'Commessa', 'Cliente', 'Ordinarie', 'Straordinarie', 'Viaggio', 'Totale', 'Ferie', 'Malattia', 'Note'];

    var trs = tbody.querySelectorAll('tr');
    trs.forEach(function(tr) {
      var tds = tr.querySelectorAll('td');
      if (tds.length < 11) return;
      data.push([
        tds[0].textContent.trim(),
        tds[1].textContent.trim(),
        tds[2].textContent.trim(),
        parseFloat(tds[3].textContent.trim()) || 0,
        parseFloat(tds[4].textContent.trim()) || 0,
        parseFloat(tds[5].textContent.trim()) || 0,
        parseFloat(tds[6].textContent.trim()) || 0,
        tds[7].textContent.trim(),
        tds[8].textContent.trim(),
        tds[9].textContent.trim()
      ]);
    });

    mese = document.getElementById('filtroMese').value || new Date().toISOString().slice(0,7);
    var nomeUtente = (APP.user.nome || APP.user.username || 'utente').replace(/\s+/g, '-').toLowerCase();
    filename = 'timbrature-' + nomeUtente + '-' + mese + '.xlsx';
    sheetName = 'Le mie timbrature';
  }

  if (data.length === 0) {
    alert('Nessun dato da esportare.');
    return;
  }

  // Crea il foglio di lavoro con intestazioni + dati
  var wsData = [headers].concat(data);
  var ws = XLSX.utils.aoa_to_sheet(wsData);

  // Larghezza colonne (in caratteri)
  ws['!cols'] = [
    { wch: 12 },  // Data
    { wch: 20 },  // Utente / Commessa
    { wch: 20 },  // Commessa / Cliente
    { wch: 10 },  // Ordinarie
    { wch: 14 },  // Straordinarie
    { wch: 10 },  // Viaggio
    { wch: 10 },  // Totale
    { wch: 8 },   // Ferie
    { wch: 8 },   // Malattia
    { wch: 40 }   // Note
  ];

  // Applica stile all'intestazione (bold + sfondo)
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

  // Crea il workbook con un foglio
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Aggiungi un secondo foglio con i totali
  var totaleOrd = 0, totaleStr = 0, totaleViag = 0, totaleTot = 0;
  data.forEach(function(row) {
    totaleOrd  += row[3];
    totaleStr  += row[4];
    totaleViag += row[5];
    totaleTot  += row[6];
  });

  var riepilogoData = [
    ['Riepilogo', ''],
    ['Periodo', mese],
    ['Totale righe', data.length],
    ['', ''],
    ['Ore ordinarie', totaleOrd],
    ['Ore straordinarie', totaleStr],
    ['Ore viaggio', totaleViag],
    ['', ''],
    ['TOTALE ORE', totaleTot]
  ];
  var ws2 = XLSX.utils.aoa_to_sheet(riepilogoData);
  ws2['!cols'] = [{ wch: 22 }, { wch: 15 }];

  // Bold sui primi titoli
  ['A1', 'A5', 'A6', 'A7', 'A9'].forEach(function(addr) {
    if (ws2[addr]) ws2[addr].s = { font: { bold: true } };
  });
  if (ws2['B9']) ws2['B9'].s = { font: { bold: true, color: { rgb: 'FF4361EE' } } };

  XLSX.utils.book_append_sheet(wb, ws2, 'Riepilogo');

  // Genera e scarica il file
  XLSX.writeFile(wb, filename);
};
