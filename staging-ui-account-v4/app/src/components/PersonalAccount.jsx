import React,{useEffect,useState} from 'react';
import {verifiedSelf,saveOwnName,requestOwnEmail,resetOwnPassword,signOutOwnSessions} from '../domain/selfAccount.js';
export default function PersonalAccount({user,membership,client,demoMode,readOnly,section}) {
  const [current,setCurrent]=useState(user),[editing,setEditing]=useState(''),[value,setValue]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[verified,setVerified]=useState(false);
  const enabled=!demoMode&&!readOnly&&!!client&&!!user?.id;
  useEffect(()=>{setCurrent(user);},[user]);
  useEffect(()=>{let live=true;setCurrent(user);setVerified(false);setEditing('');setMessage('');setError('');if(enabled)verifiedSelf(client,user.id).then(result=>{if(live){setCurrent(result);setVerified(true);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[user?.id,client,enabled,section]);
  const run=async action=>{if(!enabled||busy)return;setBusy(true);setError('');setMessage('');try{await action();}catch(e){setError(e.message||'The request could not be completed.');}finally{setBusy(false);}};
  const name=current?.user_metadata?.full_name||current?.user_metadata?.name||'';
  const begin=(field,initial)=>{setEditing(field);setValue(initial);setError('');setMessage('');};
  const row=(label,text,action)=><div className="mf-account-row"><div><strong>{label}</strong><p>{text||'Not provided'}</p></div>{action}</div>;
  return <section className="panel mf-personal-page" aria-label={section==='profile'?'Personal profile':'Account security'}>
    {demoMode&&<p className="invoice-status info">Demo preview — account changes are disabled. No real account will be contacted.</p>}
    {readOnly&&<p className="invoice-status info">Account changes are unavailable in this read-only workspace.</p>}
    {error&&<p role="alert" className="invoice-status error">{error}</p>}{message&&<p role="status" className="invoice-status success">{message}</p>}
    {section==='profile'?<>
      {row('Name',name,<button type="button" disabled={!enabled||busy} onClick={()=>begin('name',name)}>Edit</button>)}
      {row('Company',membership?.companies?.trading_name||membership?.companies?.name)}
      {row('Role',membership?.role_label)}
    </>:<>
      {row('Login email',current?.email,<button type="button" disabled={!enabled||busy} onClick={()=>begin('email',current?.email||'')}>Update</button>)}
      {verified&&current?.email_confirmed_at&&<p className="helper-text">Email confirmed by the authentication provider.</p>}
      {current?.new_email&&<p className="helper-text">Pending email change: {current.new_email}. Follow the confirmation instructions sent by the provider.</p>}
      {row('Password','Request a secure password reset link.',<button type="button" disabled={!enabled||busy} onClick={()=>run(async()=>{await resetOwnPassword(client,user.id,window.location.origin);setMessage('Password reset requested. Check your inbox for the secure link.');})}>Send reset link</button>)}
      {row('Sessions','Sign out on all devices. Existing access tokens may remain valid until they expire.',<button type="button" disabled={!enabled||busy} onClick={()=>begin('sessions','')}>Sign out everywhere</button>)}
    </>}
    {editing&&<form className="mf-account-edit" onSubmit={event=>{event.preventDefault();run(async()=>{
      if(editing==='name'){const result=await saveOwnName(client,user.id,value);setCurrent(result.user);setMessage(result.warning||'Your name has been saved.');}
      if(editing==='email'){const result=await requestOwnEmail(client,user.id,value,window.location.origin);setCurrent(result);setMessage(result.email===value.trim()?'Your login email has been updated.':'Email change requested. Check your current and new inboxes for any required confirmations.');}
      if(editing==='sessions')await signOutOwnSessions(client,user.id);
      setEditing('');
    });}}>
      {editing==='sessions'?<p>You will also be signed out of this device.</p>:<label>{editing==='name'?'Name':'New login email'}<input autoFocus required maxLength={editing==='name'?120:254} type={editing==='email'?'email':'text'} value={value} disabled={busy} onChange={event=>setValue(event.target.value)}/></label>}
      <div className="button-row"><button type="button" className="ghost" disabled={busy} onClick={()=>{setEditing('');setError('');}}>Cancel</button><button type="submit" disabled={busy}>{busy?'Saving…':editing==='sessions'?'Confirm sign out': 'Save'}</button></div>
    </form>}
  </section>;
}
