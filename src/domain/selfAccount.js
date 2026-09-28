// Only the provider's current user can be changed; never accepts a target-user payload.
export async function verifiedSelf(client, expectedId) {
  if (!client || !expectedId) throw new Error('Sign in to manage your account.');
  const {data,error}=await client.auth.getUser();
  if(error) throw error;
  if(!data?.user || data.user.id!==expectedId) throw new Error('Your session changed. Reload before continuing.');
  return data.user;
}
export async function saveOwnName(client, expectedId, value) {
  const name=value.trim();
  if(!name || name.length>120) throw new Error('Enter a name between 1 and 120 characters.');
  await verifiedSelf(client,expectedId);
  const {error}=await client.auth.updateUser({data:{full_name:name}});
  if(error) throw error;
  const user=await verifiedSelf(client,expectedId);
  if(user.user_metadata?.full_name!==name) throw new Error('The saved name could not be verified. Reload before retrying.');
  let warning='';
  try {
    const mirror=await client.from('profiles').upsert({id:user.id,email:user.email||'',full_name:name},{onConflict:'id'});
    if(mirror.error) throw mirror.error;
  } catch { warning='Your account name is saved, but the profile directory could not be updated. Please retry later.'; }
  return {user,warning};
}
export async function requestOwnEmail(client,expectedId,value,redirectTo) {
  const email=value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  const current=await verifiedSelf(client,expectedId);
  if(email===current.email) throw new Error('Enter a different email address.');
  const {error}=await client.auth.updateUser({email},{emailRedirectTo:redirectTo});
  if(error) throw error;
  return verifiedSelf(client,expectedId);
}
export async function resetOwnPassword(client,expectedId,redirectTo) {
  const user=await verifiedSelf(client,expectedId);
  if(!user.email) throw new Error('This account has no login email.');
  const {error}=await client.auth.resetPasswordForEmail(user.email,{redirectTo});
  if(error) throw error;
}
export async function signOutOwnSessions(client,expectedId) {
  await verifiedSelf(client,expectedId);
  const {error}=await client.auth.signOut({scope:'global'});
  if(error) throw error;
}
