// Co-op lobby: room create/join, the room screen, and the WebSocket to /ws.
// The game supplies hooks; this module never touches the fight itself.
const SEAT_KEY = 'shower-souls-seat', NAME_KEY = 'shower-souls-name';

export function createParty(hooks) {
  const $ = (id) => document.getElementById(id);
  let ws = null, opening = null, you = null, room = null, reconnectTimer = null, attempts = 0, countdownTimer = null;
  const readSeat = () => { try { return JSON.parse(sessionStorage.getItem(SEAT_KEY)); } catch { return null; } };
  const saveSeat = () => { if (you && room) sessionStorage.setItem(SEAT_KEY, JSON.stringify({ token: you.token, code: room.code })); };
  const clearSeat = () => sessionStorage.removeItem(SEAT_KEY);
  const me = () => room?.players.find((p) => p.id === you?.id);

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      socket.onopen = () => { ws = socket; opening = null; attempts = 0; resolve(); };
      socket.onmessage = (event) => { try { handle(JSON.parse(event.data)); } catch (error) { console.error(error); } };
      socket.onclose = () => {
        if (opening) { opening = null; reject(new Error('Could not reach the server.')); }
        if (ws === socket) ws = null;
        if (you) scheduleReconnect();
      };
    });
    return opening;
  }
  function send(msg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
  async function request(msg) {
    try { await connect(); send(msg); } catch (error) { status(error.message); }
  }
  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    status('Connection lost. Reconnecting…');
    const delay = Math.min(5000, 500 * 2 ** attempts++);
    reconnectTimer = setTimeout(async () => {
      if (!you) return;
      try { await connect(); send({ type: 'resume', token: you.token }); } catch { scheduleReconnect(); }
    }, delay);
  }

  function handle(msg) {
    if (msg.type === 'joined') { you = msg.you; status(''); }
    else if (msg.type === 'room') {
      room = msg.room; saveSeat(); render();
      const self = me();
      if (room.phase === 'fight' && self?.inFight && !hooks.inFight()) send({ type: 'back' });
      hooks.onRoom(room, you.id);
    } else if (msg.type === 'start') startCountdown(msg);
    else if (msg.type === 'state') hooks.onState(msg.id, msg.s);
    else if (msg.type === 'gone') hooks.onGone(msg.id);
    else if (msg.type === 'error') {
      status(msg.message);
      if (msg.code === 'no_session') { you = null; room = null; clearSeat(); render(); }
    }
  }
  function startCountdown(msg) {
    clearInterval(countdownTimer);
    let left = 3; $('party-countdown').textContent = `THE FIGHT BEGINS IN ${left}`; $('party-countdown').hidden = false; $('party-start').hidden = true; $('party-wait').hidden = true;
    countdownTimer = setInterval(() => {
      left--;
      if (left > 0) { $('party-countdown').textContent = `THE FIGHT BEGINS IN ${left}`; return; }
      clearInterval(countdownTimer); $('party-countdown').hidden = true;
      $('party').hidden = true;
      hooks.onStart({ players: msg.players, count: msg.count, selfId: you.id });
    }, 1000);
  }

  function status(text) { $('party-status').textContent = text; }
  function render() {
    $('party-entry').hidden = !!room; $('party-room').hidden = !room;
    if (!room) return;
    const self = me(), host = !!self?.host;
    $('party-code').textContent = room.code;
    $('party-link').value = `${location.origin}/?room=${room.code}`;
    $('party-players').replaceChildren(...room.players.map((p) => {
      const li = document.createElement('li'), dot = document.createElement('i'), name = document.createElement('span'), note = document.createElement('small');
      dot.style.background = p.color; name.textContent = p.name + (p.id === you.id ? ' (you)' : '');
      note.textContent = !p.connected ? 'RECONNECTING…' : p.host ? 'HOST' : p.inFight ? 'IN THE STALL' : '';
      li.append(dot, name, note); return li;
    }), ...Array.from({ length: room.max - room.players.length }, () => {
      const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'An empty place in the stall'; return li;
    }));
    const fighting = room.phase === 'fight';
    $('party-start').hidden = !host || fighting || !$('party-countdown').hidden;
    $('party-wait').hidden = (host && !fighting) || !$('party-countdown').hidden;
    $('party-wait').textContent = fighting ? 'Your party is still in the stall. Wait here for them.' : 'Waiting for the host to start the fight.';
  }

  $('party-name').value = localStorage.getItem(NAME_KEY) || '';
  const name = () => { const value = $('party-name').value.trim(); if (value) localStorage.setItem(NAME_KEY, value); return value; };
  $('party-create').onclick = () => { if (!name()) return status('Enter a name first.'); request({ type: 'create', name: name() }); };
  const join = () => { if (!name()) return status('Enter a name first.'); request({ type: 'join', code: $('party-join-code').value, name: name() }); };
  $('party-join').onclick = join;
  $('party-join-code').onkeydown = (event) => { if (event.key === 'Enter') join(); };
  $('party-start').onclick = () => send({ type: 'start' });
  $('party-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('party-link').value); $('party-copy').textContent = 'COPIED'; }
    catch { $('party-link').select(); $('party-copy').textContent = 'PRESS ⌘C'; }
    setTimeout(() => { $('party-copy').textContent = 'COPY LINK'; }, 1600);
  };
  $('party-leave').onclick = () => { leave(); hide(); };
  $('party-back').onclick = hide;

  function open() { $('party').hidden = false; status(''); render(); }
  function hide() { $('party').hidden = true; }
  function leave() {
    send({ type: 'leave' }); clearTimeout(reconnectTimer); clearInterval(countdownTimer);
    you = null; room = null; clearSeat(); ws?.close(); ws = null; $('party-countdown').hidden = true; render();
  }

  // Rejoin after a reload, or open with a friend's invite code.
  const params = new URLSearchParams(location.search), invite = params.get('room'), seat = readSeat();
  if (seat?.token) { you = { token: seat.token }; connect().then(() => send({ type: 'resume', token: seat.token })).catch(() => scheduleReconnect()); }
  if (invite) $('party-join-code').value = invite.toUpperCase().slice(0, 4);

  return {
    open, hide, leave,
    get active() { return !!room; },
    get selfId() { return you?.id ?? null; },
    get room() { return room; },
    wantsOpen: !!(invite || seat?.token),
    sendState(state) { send({ type: 'state', s: state }); },
    back() { send({ type: 'back' }); open(); },
  };
}
