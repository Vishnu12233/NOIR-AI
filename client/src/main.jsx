import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './lib/ui.jsx';
import { ToastHost, RouterProvider, useAuth } from './lib/ui.jsx';
import './app.css';
import { Landing } from './views/Landing.jsx';
import { AuthView } from './views/Auth.jsx';
import { AppShell, Dashboard, Projects, Templates, Assistant, Activity, Integrations, Usage, Settings, AuditView, TeamsView } from './views/App.jsx';
import { Builder } from './views/Builder.jsx';
import { ProjectView } from './views/Project.jsx';
import { ToastsGate } from './views/_util.jsx';

const routes = [
  { pattern: /^\/$/, Component: Landing },
  { pattern: /^\/login\/?$/, Component: (p) => <AuthView mode="login" /> },
  { pattern: /^\/signup\/?$/, Component: (p) => <AuthView mode="signup" /> },
  { pattern: /^\/forgot-password\/?$/, Component: (p) => <AuthView mode="forgot" /> },
  { pattern: /^\/reset-password\/?$/, Component: (p) => <AuthView mode="reset" query={p.query} /> },
  { pattern: /^\/verify-email\/?$/, Component: (p) => <AuthView mode="verify" query={p.query} /> },
  { pattern: /^\/create\/?$/, Component: () => <Gate><Builder /></Gate> },
  { pattern: /^\/project\/([^/]+)\/?$/, Component: (p) => <Gate><ProjectView id={p.params[0]} query={p.query} /></Gate> },
  { pattern: /^\/app\/?$/, Component: () => <Gate><Shell><Dashboard /></Shell></Gate> },
  { pattern: /^\/app\/projects\/?$/, Component: () => <Gate><Shell><Projects /></Shell></Gate> },
  { pattern: /^\/app\/templates\/?$/, Component: () => <Gate><Shell><Templates /></Shell></Gate> },
  { pattern: /^\/app\/assistant\/?$/, Component: () => <Gate><Shell><Assistant /></Shell></Gate> },
  { pattern: /^\/app\/activity\/?$/, Component: () => <Gate><Shell><Activity /></Shell></Gate> },
  { pattern: /^\/app\/teams\/?$/, Component: () => <Gate><Shell><TeamsView /></Shell></Gate> },
  { pattern: /^\/app\/integrations\/?$/, Component: () => <Gate><Shell><Integrations /></Shell></Gate> },
  { pattern: /^\/app\/usage\/?$/, Component: () => <Gate><Shell><Usage /></Shell></Gate> },
  { pattern: /^\/app\/settings\/?$/, Component: () => <Gate><Shell><Settings /></Shell></Gate> },
  { pattern: /^\/app\/audit\/?$/, Component: () => <Gate><Shell><AuditView /></Shell></Gate> },
];

function Gate({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="center-load"><SpinnerSmall /> Checking session…</div>;
  if (!user) { window.location.hash = '#/login'; return null; }
  return children;
}
function SpinnerSmall() { return <span className="spinner" />; }

// eslint-disable-next-line react/display-name
const Shell = ({ children }) => <ToastsGate><AppShell>{children}</AppShell></ToastsGate>;

function App() {
  return (
    <AuthProvider>
      <ToastHost>
        <RouterProvider routes={routes} fallback={() => <Landing />} />
      </ToastHost>
    </AuthProvider>
  );
}
createRoot(document.getElementById('root')).render(<App />);
