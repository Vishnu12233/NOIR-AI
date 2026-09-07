// SSE client for the streaming assistant endpoint (Phase 46).
// Falls back cleanly: throws {fallback:true} on stream errors so callers can
// retry the non-stream endpoint. Never fakes progress — deltas are server tokens.
import { getToken } from './api.js';

export async function chatStream(body, { onDelta } = {}) {
  const tok = getToken();
  const out = { reply: '', provider: null, builtin: false, mode: null, actions: null, patch: null, streamed: false };
  const res = await fetch('/api/assistant/chat/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...(tok ? { 'x-noir-token': tok } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    let msg = 'HTTP ' + res.status;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch { /* keep */ }
    const e = new Error(msg); e.fallback = true; throw e;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let hitDone = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (ev.type === 'error') { const e = new Error(ev.message || 'Stream failed'); e.fallback = true; throw e; }
        if (ev.type === 'done') { hitDone = true; break; }
        if (ev.type === 'delta') {
          out.reply += ev.text || '';
          out.provider = ev.provider ?? out.provider;
          if (ev.builtin) out.builtin = true;
          if (ev.mode) out.mode = ev.mode;
          if (ev.actions) out.actions = ev.actions;
          if (ev.patch) out.patch = ev.patch;
          out.streamed = true;
          onDelta && onDelta(out.reply);
        }
      }
      if (hitDone) break;
    }
    if (hitDone) break;
  }
  return out;
}
