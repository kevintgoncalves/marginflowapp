import React,{useEffect,useState} from 'react';
import {loadEffectiveCompanyAccess} from '../lib/entitlementsRepository.js';
export default function CompanySubscription({membership,client,demoMode}) {
  const [access,setAccess]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[attempt,setAttempt]=useState(0);
  const companyId=membership?.company_id;
  useEffect(()=>{let live=true;setAccess(null);setError('');if(!demoMode&&client&&companyId){setLoading(true);loadEffectiveCompanyAccess(companyId,client).then(data=>{if(live)setAccess(data);}).catch(e=>{if(live)setError(e.message||'Subscription information could not be loaded.');}).finally(()=>{if(live)setLoading(false);});}return()=>{live=false;};},[companyId,client,demoMode,attempt]);
  return <section className="panel mf-personal-page" aria-label="Company subscription">
    <h2>{membership?.companies?.trading_name||membership?.companies?.name||'Company subscription'}</h2>
    <p className="helper-text">This subscription belongs to the company.</p>
    {demoMode?<p className="invoice-status info">Demo preview — no real subscription or billing account is connected.</p>:<>
      {loading&&<p role="status">Loading company access…</p>}
      {error&&<div role="alert"><p>{error}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>Retry</button></div>}
      {access?.plan_key&&<div className="mf-account-row"><div><strong>Current plan</strong><p>{access.plan_key}</p></div></div>}
      {access?.effective_status&&<div className="mf-account-row"><div><strong>Access status</strong><p>{access.effective_status}</p></div></div>}
      {access?.trial_ends_at&&<div className="mf-account-row"><div><strong>Trial ends</strong><p>{new Date(access.trial_ends_at).toLocaleDateString('en-GB')}</p></div></div>}
    </>}
    <div className="mf-billing-empty"><h3>Billing is not configured</h3><p>A customer billing portal is not connected. Prices, renewal payments, payment methods, billing details and subscription invoices are not available here yet.</p><p>Supplier invoices remain in Invoice Control Centre.</p></div>
  </section>;
}
