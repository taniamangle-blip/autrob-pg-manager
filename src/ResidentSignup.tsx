import { FormEvent, useState } from 'react';
import { ArrowRight, Building2, LockKeyhole } from 'lucide-react';

export default function ResidentSignup(){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setBusy(true);setError('');
    const body=Object.fromEntries(new FormData(e.currentTarget).entries());
    try{const r=await fetch('/api/resident/portal/signup',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);if(!d.accessToken)throw new Error('Account created, but sign-in could not start. Please log in.');sessionStorage.setItem('autrob-resident-portal-token',d.accessToken);window.location.assign('/resident/dashboard')}
    catch(x){setError(x instanceof Error?x.message:'Could not create resident account.');setBusy(false)}
  };
  return <main className="resident-portal-wrap"><section className="resident-login-card"><span className="resident-login-mark"><Building2 size={23}/></span><span className="resident-eyebrow">RESIDENT PORTAL</span><h1>Create your account</h1><p>Sign up to track your enquiries, stay details, bills and owner responses.</p><form onSubmit={submit}><label>Full name<input name="name" autoComplete="name" required minLength={2}/></label><label>Mobile number<input name="phone" type="tel" autoComplete="tel" inputMode="numeric" required minLength={10} placeholder="10-digit mobile number"/></label><label>Email address <small>optional</small><input name="email" type="email" autoComplete="email" placeholder="you@example.com"/></label><label>Create password<input name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters"/></label>{error&&<div className="resident-portal-error">{error}</div>}<button className="resident-portal-primary" disabled={busy}>{busy?'Creating account…':'Sign up as Resident'} <ArrowRight size={16}/></button></form><small><LockKeyhole size={13}/> Use your mobile number to sign in after registration.</small><a href="/resident/login">Already registered? Sign in <ArrowRight size={14}/></a></section></main>
}
