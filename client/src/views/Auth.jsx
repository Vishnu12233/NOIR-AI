import React, { useState } from 'react';
import { Link, useAuth, Field, Spinner } from '../lib/ui.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/ui.jsx';
import { ArrowLeft } from 'lucide-react';

export function AuthView({ mode, query }) {
  const qtok = (query && query.token) || '';

  const { login, signup } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [newPw, setNewPw] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (mode === 'login') await login(email, password);
      else if (mode === 'signup') await signup({ email, password, name });
      else if (mode === 'forgot') { const d = await api('/auth/forgot', { body: { email } }); setMsg('If the account exists, a reset email has been sent.' + (d.preview_link ? '\nSandbox demo link: ' + d.preview_link : '')); }
      else if (mode === 'reset') { const d = await api('/auth/reset', { body: { token: qtok, password: newPw } }); setMsg('Password updated — you can sign in now.'); }
      else if (mode === 'verify') { const d = await api('/auth/verify', { body: { token: qtok } }); setMsg('Email verified. You can sign in.'); }
      window.location.hash = '#/app';
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  const titles = { login: 'Welcome back', signup: 'Create your NOIR account', forgot: 'Reset password', reset: 'Choose a new password', verify: 'Verify your email' };
  const subs = { login: 'Your AI engineering team is waiting.', signup: 'One account. An entire team that builds for you.', forgot: 'We will email you a reset link if the account exists.', reset: 'Minimum 8 characters.', verify: 'Enter the 6-digit code emailed to you.' };
  return (
    <div className="auth-page">
      <div style={{ width: '100%', maxWidth: 380 }}>
        <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit', justifyContent: 'center', padding: '0 0 18px' }}>
          <span className="brand-mark">N</span>
          <span><span className="brand-name">NOIR</span><br /><span className="brand-tag">Think · Build · Ship · Improve</span></span>
        </Link>
        <div className="auth-card">
          <h2 style={{ fontSize: 21 }}>{titles[mode]}</h2>
          <div className="muted small" style={{ margin: '2px 0 12px' }}>{subs[mode]}</div>
          {err ? <div className="badge err" style={{ display: 'flex', marginBottom: 10, borderRadius: 8, padding: '8px 10px', width: '100%' }}>⚠ {err}</div> : null}
          {msg ? <div className="badge ok" style={{ display: 'flex', marginBottom: 10, borderRadius: 8, padding: '8px 10px', width: '100%', whiteSpace: 'pre-wrap' }}>{msg}</div> : null}
          <form onSubmit={submit}>
            {mode === 'signup' ? (
              <Field label="Your name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required autoFocus /></Field>
            ) : null}
            {mode === 'reset' && !qtok && qtok !== undefined ? null : null}
            {mode !== 'reset' && mode !== 'verify' ? (
              <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus={mode !== 'signup'} /></Field>
            ) : null}
            {mode === 'reset' && !qtok ? (
              <Field label="Reset token (from the email link)"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="paste ?token=… value" required autoFocus /></Field>
            ) : null}
            {mode === 'login' || mode === 'signup' || mode === 'reset' ? (
              <Field label={mode === 'reset' ? 'New password' : 'Password'}>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoFocus={mode === 'signup'} />
              </Field>
            ) : null}
            {mode === 'login' ? <div style={{ textAlign: 'right', marginTop: 8 }}><Link to="/forgot-password" className="small">Forgot password?</Link></div> : null}
            <button className="btn primary lg" style={{ width: '100%', marginTop: 16 }} disabled={busy}>{busy ? <Spinner /> : (mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Set new password' : 'Verify email')}</button>
          </form>
          <div className="auth-foot">
            {mode === 'login' ? <>New to NOIR? <Link to="/signup">Create an account</Link></> : null}
            {mode === 'signup' ? <>Already registered? <Link to="/login">Sign in</Link></> : null}
            {mode === 'forgot' || mode === 'reset' || mode === 'verify' ? <Link to="/login"><ArrowLeft size={12} style={{ verticalAlign: '-2px' }} /> Back to sign in</Link> : null}
          </div>
        </div>
        <div className="auth-foot">
          <button className="btn ghost sm" onClick={async () => { try { await login('demo@noir.ai', 'password123'); } catch (e) { toast(e.message, 'error'); } }}>Try demo account (demo@noir.ai)</button>
        </div>
      </div>
    </div>
  );
}
