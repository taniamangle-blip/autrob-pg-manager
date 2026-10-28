import { FormEvent, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, RefreshCw, Wallet } from 'lucide-react';
import './owner-wallet.css';

type Transaction={id:string;direction:'CREDIT'|'DEBIT';amountPaise:number;balanceAfterPaise:number;description:string;createdAt:string};
type Request={id:string;amountPaise:number;note:string;status:string;createdAt:string;reviewedAt:string};
type Payload={wallet:{balancePaise:number};transactions:Transaction[];requests:Request[]};
const api=async<T,>(url:string,options:RequestInit={}):Promise<T>=>{const response=await fetch(url,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})}});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`Request failed (${response.status})`);return body as T};
const rupees=(paise:number)=>`₹${(paise/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const date=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})};

export default function WalletPanel(){
 const [payload,setPayload]=useState<Payload|null>(null),[amount,setAmount]=useState(''),[note,setNote]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const load=async()=>{try{setPayload(await api<Payload>('/api/wallet'));window.dispatchEvent(new Event('owner-wallet-updated'));setError('')}catch(e){setError((e as Error).message)}};
 useEffect(()=>{void load()},[]);
 const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');setMessage('');try{await api('/api/wallet/recharge-requests',{method:'POST',body:JSON.stringify({amount:Number(amount),note})});setAmount('');setNote('');setMessage('Recharge request sent to the platform administrator. Your balance will update after approval.');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 return <main className="owner-wallet-page">
  <header className="owner-wallet-heading"><div><span className="section-kicker">MONEY · WALLET</span><h1>Owner wallet</h1><p>Request a wallet top-up and track booking confirmation charges.</p></div><button className="owner-wallet-refresh" onClick={()=>void load()}><RefreshCw size={15}/> Refresh</button></header>
  {error&&<div className="owner-wallet-error" role="alert">{error}</div>}{message&&<div className="owner-wallet-success" role="status"><Check size={16}/>{message}</div>}
  <section className="owner-wallet-summary"><span className="owner-wallet-icon"><Wallet size={22}/></span><div><small>AVAILABLE BALANCE</small><strong>{rupees(payload?.wallet?.balancePaise||0)}</strong><p>Booking confirmation charges are 15% of the quoted monthly stay rent.</p></div></section>
  <div className="owner-wallet-columns"><section className="owner-wallet-card"><h2>Request a recharge</h2><p>Submit a request for the platform administrator to review. Your wallet is credited after approval.</p><form onSubmit={submit}><label>Amount (₹)<input type="number" min="1" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="e.g. 5,000"/></label><label>Note (optional)<textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="Add a payment reference or note"/></label><button disabled={busy}>{busy?'Sending request…':'Send recharge request'}</button></form></section>
   <section className="owner-wallet-card"><h2>Recharge requests</h2>{payload?.requests.length?<div className="owner-wallet-list">{payload.requests.map(r=><article key={r.id}><div><strong>{rupees(r.amountPaise)}</strong><small>{date(r.createdAt)}{r.note?` · ${r.note}`:''}</small></div><span className={`owner-wallet-status ${r.status.toLowerCase()}`}>{r.status}</span></article>)}</div>:<p className="owner-wallet-empty">No recharge requests yet.</p>}</section></div>
  <section className="owner-wallet-card owner-wallet-transactions"><h2>Wallet transactions</h2>{payload?.transactions.length?<div className="owner-wallet-list">{payload.transactions.map(t=><article key={t.id}><span className={`owner-wallet-direction ${t.direction.toLowerCase()}`}>{t.direction==='CREDIT'?<ArrowDownLeft size={17}/>:<ArrowUpRight size={17}/>}</span><div className="owner-wallet-transaction-copy"><strong>{t.description}</strong><small>{date(t.createdAt)} · Balance after: {rupees(t.balanceAfterPaise)}</small></div><b className={t.direction.toLowerCase()}>{t.direction==='CREDIT'?'+':'−'}{rupees(t.amountPaise)}</b></article>)}</div>:<p className="owner-wallet-empty">Your top-ups and booking charges will appear here.</p>}</section>
 </main>
}
