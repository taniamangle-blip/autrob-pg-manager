import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, LockKeyhole } from 'lucide-react';
import './login.css';

export default function OwnerSignup(){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setBusy(true);setError('');
    const body=Object.fromEntries(new FormData(e.currentTarget).entries());
    try{const r=await fetch('/api/auth/signup',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);window.location.assign('/')}
    catch(x){setError(x instanceof Error?x.message:'Could not create the owner account.');setBusy(false)}
  };
  return <main className="signup-screen"><section className="signup-card"><a className="signup-back" href="/"><ArrowLeft size={15}/> Owner login</a><span className="signup-mark"><Building2 size={22}/></span><span className="login-eyebrow"><i/> OWNER PORTAL</span><h1>Create your owner account</h1><p>Set up a 14-day website trial workspace. Add your property details after signing in.</p><form onSubmit={submit}><label>Owner name<input name="name" autoComplete="name" required minLength={2}/></label><label>PG / business name<input name="pgName" autoComplete="organization" required minLength={2}/></label><label>Email address<input name="email" type="email" autoComplete="email" required/></label><label>Password <small>(at least 10 characters)</small><input name="password" type="password" autoComplete="new-password" minLength={10} required/></label>{error&&<div className="login-error">{error}</div>}<button className="button button-primary" disabled={busy}>{busy?'Creating account…':<>Create owner account <ArrowRight size={15}/></>}</button></form><small className="signup-privacy"><LockKeyhole size={13}/> Your workspace is private to your owner account.</small><a className="signup-switch" href="/">Already registered? Sign in</a></section></main>
}
