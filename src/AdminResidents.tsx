import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Ban, Check, KeyRound, RefreshCw, Search, UserRoundCheck, X } from 'lucide-react';
import './platform-admin.css';

type Resident = {
  name: string;
  phone: string;
  email: string;
  property?: string;
  room?: string;
  stayType?: string;
  occupancyStatus?: string;
  workspace?: string;
  ownerName?: string;
  area?: string;
  joined?: string;
  suspended: boolean;
};

const api = async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
};

export default function AdminResidents() {
  const [rows, setRows] = useState<Resident[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [resetResident, setResetResident] = useState<Resident | null>(null);

  const load = async () => {
    setError('');
    try {
      setRows((await api<{ residents: Resident[] }>('/api/platform/residents')).residents);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(
    () => rows.filter((resident) => [resident.name, resident.phone, resident.email, resident.property, resident.room, resident.workspace, resident.ownerName, resident.area].join(' ').toLowerCase().includes(query.toLowerCase())),
    [rows, query],
  );

  const toggle = async (resident: Resident) => {
    setBusy(resident.phone);
    setError('');
    try {
      await api(`/api/platform/residents/${encodeURIComponent(resident.phone)}/suspension`, {
        method: 'PATCH',
        body: JSON.stringify({ suspended: !resident.suspended }),
      });
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy('');
    }
  };

  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetResident) return;
    const password = String(new FormData(event.currentTarget).get('password') || '');
    setBusy(resetResident.phone);
    setError('');
    try {
      await api(`/api/platform/residents/${encodeURIComponent(resetResident.phone)}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      });
      setResetResident(null);
      window.alert(`Temporary password set for ${resetResident.name}. Share it securely with the resident.`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <section>
      <div className="pa-toolbar">
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search residents by name, phone, property or owner" /></label>
        <span>{filtered.length} resident accounts</span>
        <button className="pa-action-link" onClick={() => void load()}><RefreshCw size={14} /> Refresh</button>
      </div>
      {error && <div className="pa-error">{error}</div>}
      <div className="pa-table-wrap">
        <table className="pa-table">
          <thead><tr><th>RESIDENT</th><th>PHONE / EMAIL</th><th>STAY / ENQUIRY</th><th>PG OWNER</th><th>STATUS</th><th>ACTION</th></tr></thead>
          <tbody>
            {filtered.map((resident, index) => (
              <tr key={resident.phone || `${resident.name}-${index}`}>
                <td><div className="pa-table-owner"><span className="pa-owner-logo"><UserRoundCheck size={17} /></span><span><strong>{resident.name}</strong><small>{resident.joined ? new Date(resident.joined).toLocaleDateString('en-IN') : '—'}</small></span></div></td>
                <td>{resident.phone}<small className="pa-subline">{resident.email || 'No email'}</small></td>
                <td>{resident.property ? `${resident.property}${resident.room ? ` · ${resident.room}` : ''}` : resident.area || 'Portal account'}<small className="pa-subline">{resident.stayType || resident.occupancyStatus || 'Enquiry / account'}</small></td>
                <td>{resident.ownerName || '—'}<small className="pa-subline">{resident.workspace || ''}</small></td>
                <td><span className={`pa-status ${resident.suspended ? 'suspended' : 'active'}`}>{resident.suspended ? 'Suspended' : 'Active'}</span></td>
                <td><div className="pa-row-actions">
                  <button title={`Reset password for ${resident.name}`} disabled={busy === resident.phone} onClick={() => { setError(''); setResetResident(resident); }}><KeyRound size={14} /> Reset password</button>
                  <button title={resident.suspended ? 'Restore resident access' : 'Suspend resident access'} disabled={busy === resident.phone} onClick={() => void toggle(resident)}>{resident.suspended ? <><Check size={14} /> Restore</> : <><Ban size={14} /> Suspend</>}</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && !error && <div className="pa-empty">No resident accounts found.</div>}
      </div>

      {resetResident && <div className="pa-modal-back" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setResetResident(null); }}>
        <form className="pa-modal" onSubmit={(event) => void resetPassword(event)}>
          <div className="pa-modal-head"><div><span className="pa-eyebrow">ACCOUNT ACCESS</span><h2>Reset resident password</h2><p>Set a temporary password for {resetResident.name} ({resetResident.phone}).</p></div><button type="button" className="pa-close" aria-label="Close" onClick={() => setResetResident(null)}><X size={16} /></button></div>
          <div className="pa-form-grid"><label className="pa-wide">New temporary password<input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" /></label></div>
          {error && <div className="pa-error">{error}</div>}
          <div className="pa-modal-actions"><button type="button" className="pa-secondary" onClick={() => setResetResident(null)}>Cancel</button><button className="pa-primary" disabled={busy === resetResident.phone}>{busy === resetResident.phone ? 'Saving…' : 'Set temporary password'}</button></div>
        </form>
      </div>}
    </section>
  );
}
