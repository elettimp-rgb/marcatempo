// ============================================================
// MARCATEMPO - Gestione notifiche push
// ============================================================

const PUSH_API_URL = 'https://marcatempo-api.elettimp.workers.dev';

// Converti la chiave pubblica VAPID da base64 a Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Chiedi lo stato attuale
async function getStatoNotifiche() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supportato: false, motivo: 'Browser non supporta le notifiche push' };
  }
  if (Notification.permission === 'denied') {
    return { supportato: true, attivo: false, motivo: 'Notifiche bloccate dal browser' };
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return { supportato: true, attivo: !!sub };
  } catch (e) {
    return { supportato: false, motivo: e.message };
  }
}

// Attiva notifiche
async function attivaNotifichePush(idUtente) {
  try {
    // 1. Permesso
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Permesso notifiche negato' };
    }

    // 2. Chiave pubblica dal server
    const rKey = await fetch(PUSH_API_URL + '/api/push/vapid-public').then(r => r.json());
    if (!rKey || !rKey.publicKey) {
      return { success: false, error: 'Chiave VAPID non disponibile' };
    }

    // 3. Registra SW
    const reg = await navigator.serviceWorker.ready;

    // 4. Sottoscrivi
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(rKey.publicKey)
    });

    // 5. Invia al server
    const rSave = await fetch(PUSH_API_URL + '/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_utente: idUtente,
        subscription: sub.toJSON()
      })
    }).then(r => r.json());

    if (!rSave || !rSave.success) {
      return { success: false, error: (rSave && rSave.error) || 'Errore salvataggio' };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Disattiva notifiche
async function disattivaNotifichePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { success: true };

    await fetch(PUSH_API_URL + '/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint })
    });

    await sub.unsubscribe();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}