import { useEffect, useState } from 'react';
import { ArrowDownToLine, Building2, Check, Copy, KeyRound, Plus, RefreshCw } from 'lucide-react';
import './platform-admin.css';

type Owner = { organizationId: string; pgName: string; ownerName: string; ownerEmail: string };
type License = { id: string; organizationId: string; pgName: string; ownerEmail: string; ownerLoginEmail?: string; keyHint: string; activationKey: string; plan: string; startsAt: string; expiresAt: string; status: string };
const request = async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(url, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
};
const dateLabel = (value: string) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const downloadKey = (license: License, notify: (text: string) => void) => {
  if (!license.activationKey) { notify('This license has no recoverable key. Issue a new key for this owner.'); return; }
  const content = `Autrob Stay license\nPG / Owner: ${license.pgName}\nWindows login: ${license.ownerLoginEmail || license.ownerEmail}\nPlan: ${license.plan}\nValid through: ${dateLabel(license.expiresAt)}\nActivation key: ${license.activationKey}\n`;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const fileName = `Autrob-Stay-license-${license.pgName.replace(/[^a-z0-9]+/gi, '-') || 'owner'}.txt`;
  const legacyNavigator = navigator as Navigator & { msSaveOrOpenBlob?: (file: Blob, name: string) => boolean };
  if (legacyNavigator.msSaveOrOpenBlob) { legacyNavigator.msSaveOrOpenBlob(blob, fileName); notify(`License file downloaded for ${license.pgName}`); return; }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = fileName; link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Keep the object URL alive long enough for Chromium/Electron to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  notify(`License file download started for ${license.pgName}`);
};
export function LicenseManagementPanel({ owners, notify }: { owners: Owner[]; notify: (text: string) => void }) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<License | null>(null);
  
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [ownerLoginEmail, setOwnerLoginEmail] = useState('');
  const load = async () => { setLoading(true); try { const result = await request<{ licenses: License[] }>('/api/platform/licenses'); setLicenses(result.licenses); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load licenses'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const copyKey = async (license: License) => { try { await navigator.clipboard.writeText(license.activationKey); notify(`License key copied for ${license.pgName}`); } catch { notify('Clipboard access unavailable. Select the key and copy it manually.'); } };
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; setBusy(true); setError('');
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      const result = await request<{ license: Omit<License, 'activationKey'>; activationKey: string }>('/api/platform/licenses', { method: 'POST', body: JSON.stringify(body) });
      const issuedLicense = { ...result.license, activationKey: result.activationKey } as License;
      
      setIssued(issuedLicense); await load(); notify(`Activation key issued for ${issuedLicense.pgName}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not issue license'); }
    finally { setBusy(false); }
  };
  const revoke = async (license: License) => {
    if (!window.confirm(`Revoke the ${license.plan} license for ${license.pgName}?`)) return;
    try { await request(`/api/platform/licenses/${encodeURIComponent(license.id)}/revoke`, { method: 'PATCH' }); await load(); notify(`License revoked for ${license.pgName}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not revoke license'); }
  };
  return <div className="pa-license-layout">
    <section className="pa-card pa-license-issue">
      <div className="pa-card-head"><div><span className="pa-eyebrow">ISSUE OWNER-BOUND KEY</span><h2>Create a paid license</h2></div><KeyRound size={18}/></div>
      <p>The key is bound to this owner’s registered email. Windows activation uses the same owner portal password; no separate desktop password is created.</p>
      <form className="pa-form-grid" onSubmit={create}>
        <label className="pa-wide">PG owner workspace<select name="organizationId" required value={selectedOwnerId} onChange={event => { const id = event.target.value; setSelectedOwnerId(id); setOwnerLoginEmail(owners.find(owner => owner.organizationId === id)?.ownerEmail || ''); }}><option value="">Select a PG owner</option>{owners.map(owner => <option key={owner.organizationId} value={owner.organizationId}>{owner.pgName} · {owner.ownerName} ({owner.ownerEmail})</option>)}</select></label>
        <label className="pa-wide">Windows login email<input type="email" name="ownerLoginEmail" autoComplete="off" value={ownerLoginEmail} readOnly placeholder="Choose an owner above" required/></label>
        <label>Paid plan<select name="plan" defaultValue="Starter"><option>Starter</option><option>Growth</option><option>Business</option></select></label>
        <label>Valid through<input type="date" name="expiresAt" min={new Date().toISOString().slice(0, 10)} defaultValue={`${new Date().getFullYear() + 1}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`} required/></label>
        <div className="pa-wide"><button className="pa-primary" disabled={busy || !owners.length}><Plus size={15}/>{busy ? 'Issuing…' : 'Issue activation key'}</button></div>
      </form>
      {issued && <div className="pa-issued-key pa-issued-key-full"><span><Check size={15}/> Key issued for {issued.pgName} · valid through {dateLabel(issued.expiresAt)}</span><small>Use owner portal credentials · {issued.ownerLoginEmail || ownerLoginEmail}</small><input readOnly value={issued.activationKey} aria-label="New license activation key"/><div className="pa-license-key-actions"><button type="button" className="pa-secondary" onClick={() => void copyKey(issued)}><Copy size={14}/> Copy key</button><button type="button" className="pa-secondary" onClick={() => downloadKey(issued, notify)}><ArrowDownToLine size={14}/> Download key</button><button type="button" className="pa-action-link" onClick={() => { setIssued(null); }}>Dismiss</button></div></div>}
      {error && <div className="pa-error">{error}</div>}
    </section>
    <section className="pa-license-table"><div className="pa-toolbar"><strong>Issued licenses</strong><span>{licenses.length} keys</span><button type="button" className="pa-action-link" onClick={() => void load()}><RefreshCw size={14}/> Refresh</button></div>
      <div className="pa-table-wrap"><table className="pa-table"><thead><tr><th>OWNER / WORKSPACE</th><th>LICENSE KEY</th><th>PLAN</th><th>VALID THROUGH</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
        {licenses.map(license => <tr key={license.id}><td><div className="pa-table-owner"><span className="pa-owner-logo"><Building2 size={17}/></span><span><strong>{license.pgName}</strong><small>Windows login: {license.ownerLoginEmail || license.ownerEmail}</small></span></div></td><td>{license.activationKey ? <div className="pa-license-key-cell"><code>{license.activationKey}</code><button type="button" className="pa-key-icon-action" title="Copy license key" aria-label={`Copy key for ${license.pgName}`} onClick={() => void copyKey(license)}><Copy size={14}/></button><button type="button" className="pa-key-icon-action" title="Download license key" aria-label={`Download key for ${license.pgName}`} onClick={() => downloadKey(license, notify)}><ArrowDownToLine size={14}/></button></div> : <span className="pa-license-hint">{license.keyHint} · key not recoverable</span>}</td><td><span className="pa-plan">{license.plan}</span></td><td>{dateLabel(license.expiresAt)}</td><td><span className={`pa-status ${license.status.toLowerCase()}`}>{license.status}</span></td><td>{['Issued', 'Active'].includes(license.status) && <button type="button" className="pa-action-link pa-revoke" onClick={() => void revoke(license)}>Revoke</button>}</td></tr>)}
        {!loading && !licenses.length && <tr><td colSpan={6} className="pa-empty">No licenses issued yet.</td></tr>}
      </tbody></table>{loading && <div className="pa-empty">Loading licenses…</div>}</div>
      {licenses.some(license => !license.activationKey) && <p className="pa-license-legacy-note">Older license keys were stored only as one-way hashes and cannot be recovered. Issue a fresh key for those owners to enable copy and download.</p>}
    </section>
  </div>;
}
