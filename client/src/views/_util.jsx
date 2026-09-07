import React from 'react';
export const ToastsGate = ({ children }) => <>{children}</>;
export function PageHead({ title, sub, actions, back }) {
  return <div className="page-head row-between" style={{ alignItems: 'flex-end' }}>
    <div>
      {back ? <button className="btn ghost sm" onClick={() => history.back()}>← Back</button> : null}
      <h1>{title}</h1>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
    {actions ? <div className="row">{actions}</div> : null}
  </div>;
}
