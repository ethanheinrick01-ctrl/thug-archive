import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowLeft, MessageCircle, RefreshCw, Send, Users } from 'lucide-preact';
import { localPreview, supabase } from './data';
import { IconButton, Modal } from './ui';
import { friendError, prepareFriendMessage, type ArchiveMember, type FriendAction, type FriendMessage, type PendingFriendMessage } from './friends-model';
import './friends.css';
import type { Track } from './model';
import { trackCreditLabel } from './track-context';

type DirectoryView = 'all' | 'friends' | 'requests' | 'blocked';
type Rpc = (name: string, params: Record<string, unknown>) => Promise<any>;
let previewCall: Rpc | null = null;
if (import.meta.env.DEV && localPreview) {
  const key = 'thug-archive-friends-preview-v1';
  let members: ArchiveMember[] = [
    {user_id:'preview-friend',display_name:'Preview friend',relationship:'friends',revision:2},
    {user_id:'preview-request',display_name:'Preview request',relationship:'incoming',revision:1},
    {user_id:'preview-listener',display_name:'Preview listener',relationship:'none',revision:0},
  ];
  let messages: Record<string, FriendMessage[]> = {};
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved?.members?.length && saved?.messages) {members = saved.members; messages = saved.messages;}
  } catch { /* Preview state is separate from signed-in accounts. */ }
  const save = () => localStorage.setItem(key, JSON.stringify({members,messages}));
  previewCall = async (name, p) => {
    if (name === 'friend_directory') return {members:members.filter(m => m.display_name.toLowerCase().includes(String(p.p_query).toLowerCase()) && (p.p_view === 'all' ? m.relationship !== 'blocked' : p.p_view === 'requests' ? ['incoming','outgoing'].includes(m.relationship) : m.relationship === p.p_view)).slice(Number(p.p_offset),Number(p.p_offset)+51)};
    const m = members.find(x => x.user_id === p.p_peer);
    if (!m) throw {code:'42501',message:'This archive account is not available.'};
    if (name === 'change_friendship') {
      if (m.revision !== p.p_revision) throw {code:'P0001',message:'This friendship changed. Refresh and try again.'};
      m.relationship = p.p_action === 'request' ? 'outgoing' : p.p_action === 'accept' ? 'friends' : p.p_action === 'block' ? 'blocked' : 'none';
      m.revision++; save(); return null;
    }
    if (m.relationship !== 'friends') throw {code:'42501',message:'You must be friends to open this conversation.'};
    if (name === 'friend_conversation') return {messages:messages[m.user_id] || [],revision:m.revision};
    if (name === 'send_friend_message') {
      const list = messages[m.user_id] ||= [];
      if (!list.some(x => x.id === p.p_id)) list.push({id:String(p.p_id),sender_id:'local-preview',body:String(p.p_body),room_id:p.p_room as string|null,is_invite:!!p.p_room,room_active:!!p.p_room,track_id:p.p_track as string|null,is_song:!!p.p_track,created_at:new Date().toISOString()});
      messages[m.user_id] = list.slice(-100); save(); return {sent:true};
    }
    throw new Error('Unknown preview operation');
  };
}
async function rpc(name: string, params: Record<string, unknown>) {
  if (previewCall) return previewCall(name, params);
  if (!supabase) throw new Error('Sign in to open your friends.');
  const {data,error} = await supabase.rpc(name,params);
  if (error) throw error;
  return data;
}

export function Friends({userId,getRoomInvite,joinRoom,tracks,shareTrack,onShared,playTrack}: {
  userId: string;
  getRoomInvite: () => Promise<string | null>;
  joinRoom: (roomId: string) => Promise<void>;
  tracks: Track[];
  shareTrack?: Track | null;
  onShared?: () => void;
  playTrack: (id: string) => void;
}) {
  const [query,setQuery] = useState(''), [view,setView] = useState<DirectoryView>('friends'), [page,setPage] = useState(0);
  const [members,setMembers] = useState<ArchiveMember[]>([]), [more,setMore] = useState(false);
  const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [peer,setPeer] = useState<ArchiveMember|null>(null);
  const [confirm,setConfirm] = useState<{member:ArchiveMember;action:'remove'|'block'}|null>(null);
  const [notice,setNotice] = useState('');
  const generation = useRef(0), live = useRef(true), latest = useRef({query,view,page});
  const identity = useRef(userId);
  const conversationTrigger = useRef<HTMLButtonElement|null>(null);
  identity.current = userId;
  latest.current = {query,view,page};
  useEffect(() => {live.current=true;return () => {live.current=false;generation.current++;};}, [userId]);

  async function refresh(showLoading = false) {
    const request = ++generation.current, params = latest.current;
    if (showLoading) setLoading(true);
    try {
      const data = await rpc('friend_directory',{p_query:params.query,p_view:params.view,p_offset:params.page*50});
      if (!live.current || request !== generation.current) return;
      const rows = data.members as ArchiveMember[];
      setMore(rows.length>50);setMembers(rows.slice(0,50));setError('');
    } catch (e) {if (live.current && request===generation.current) setError(friendError(e));}
    finally {if (live.current && request===generation.current) setLoading(false);}
  }
  useEffect(() => {
    generation.current++;
    const timer = window.setTimeout(() => void refresh(true), query ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [query,view,page,userId]);
  useEffect(() => {
    const resume = () => {if(document.visibilityState==='visible') void refresh();};
    const timer = window.setInterval(resume,15000);
    window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
    return () => {window.clearInterval(timer);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
  }, [userId]);

  async function change(member: ArchiveMember, action: FriendAction) {
    if (busy) return;
    const actor = userId;
    setBusy(true);setError('');setNotice('');generation.current++;
    try {
      await rpc('change_friendship',{p_peer:member.user_id,p_action:action,p_revision:member.revision});
      if (!live.current || identity.current!==actor) return;
      if (peer?.user_id===member.user_id && ['remove','block'].includes(action)) setPeer(null);
      setConfirm(null);
      setNotice(action==='request' ? `Friend request sent to ${member.display_name}.` : action==='accept' ? `You and ${member.display_name} are now friends.` : action==='block' ? `${member.display_name} is blocked.` : action==='unblock' ? `${member.display_name} is unblocked.` : 'Friends updated.');
      await refresh();
    } catch(e) {if(live.current&&identity.current===actor){setConfirm(null);await refresh();if(live.current&&identity.current===actor)setError(friendError(e));}}
    finally {if(live.current&&identity.current===actor)setBusy(false);}
  }

  return <section class="friends-page" aria-labelledby="friends-heading">
    <div class="friends-heading"><div><h1 id="friends-heading">Friends</h1><p>{shareTrack?`Choose a friend to send “${shareTrack.title}”.`:'Find your people. Share a song.'}</p>{shareTrack&&!peer&&<button class="text-button" onClick={onShared}>Cancel song sharing</button>}</div><IconButton label="Refresh friends" disabled={loading||busy} onClick={()=>void refresh(true)}><RefreshCw size={20}/></IconButton></div>
    <div class={`friends-layout ${peer?'has-conversation':''}`}>
      <div class="friends-directory">
        <div class="friends-tabs" aria-label="Show members">{([['friends','Friends'],['requests','Requests'],['all','Find people'],['blocked','Blocked']] as const).map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>{setView(id);setPage(0);setQuery('');setNotice('');}}>{label}</button>)}</div>
        <label class="friends-search">Find a username<input type="search" value={query} maxLength={80} autoComplete="off" onInput={e=>{setQuery(e.currentTarget.value);setPage(0);}}/></label>
        {error && <div class="friends-error" role="alert"><p>{error}</p><button class="text-button" onClick={()=>void refresh(true)}>Try again</button></div>}
        {notice && <p class="friends-notice" role="status">{notice}</p>}
        <div class="friends-members" aria-busy={loading}>
          {!members.length && <div class="friends-empty"><Users size={28}/><p>{loading?'Loading people…':query?'No usernames match.':view==='friends'?'Your friends will appear here.':view==='requests'?'No friend requests right now.':view==='blocked'?'No blocked members.':'No other archive members yet.'}</p>{!loading&&view==='friends'&&!query&&<button class="secondary" onClick={()=>{setView('all');setPage(0);}}>Find people</button>}{!loading&&query&&<button class="text-button" onClick={()=>setQuery('')}>Clear search</button>}</div>}
          {members.map(member=><article key={member.user_id} class={`friend-member ${peer?.user_id===member.user_id?'selected':''}`}>
            <div class="friend-name"><strong>{member.display_name}</strong>{member.relationship==='incoming'&&<span>Wants to be friends</span>}{member.relationship==='outgoing'&&<span>Request sent</span>}</div>
            <div class="friend-actions">
              {member.relationship==='none'&&<button class="secondary" disabled={busy} onClick={()=>void change(member,'request')}>Add friend</button>}
              {member.relationship==='incoming'&&<><button class="primary" disabled={busy} onClick={()=>void change(member,'accept')}>Accept</button><button class="text-button" disabled={busy} onClick={()=>void change(member,'decline')}>Decline</button></>}
              {member.relationship==='outgoing'&&<button class="text-button" disabled={busy} onClick={()=>void change(member,'cancel')}>Cancel request</button>}
              {member.relationship==='friends'&&<button class="secondary" onClick={event=>{conversationTrigger.current=event.currentTarget;setPeer(member);}}><MessageCircle size={16}/>{shareTrack?'Send song':'Message'}</button>}
              {member.relationship==='blocked'?<button class="secondary" disabled={busy} onClick={()=>void change(member,'unblock')}>Unblock</button>:<details class="friend-options"><summary aria-label={`More options for ${member.display_name}`}>More</summary><div>{member.relationship==='friends'&&<button disabled={busy} onClick={()=>setConfirm({member,action:'remove'})}>Remove friend</button>}<button disabled={busy} onClick={()=>setConfirm({member,action:'block'})}>Block</button></div></details>}
            </div>
          </article>)}
        </div>
        {(page>0||more)&&<nav class="friends-pagination" aria-label="Member pages"><button class="secondary" disabled={page===0||loading} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page+1}</span><button class="secondary" disabled={!more||loading} onClick={()=>setPage(page+1)}>Next</button></nav>}
      </div>
      {peer ? <FriendConversation key={`${userId}:${peer.user_id}`} userId={userId} peer={peer} close={()=>{setPeer(null);requestAnimationFrame(()=>conversationTrigger.current?.focus());}} getRoomInvite={getRoomInvite} joinRoom={joinRoom} revoked={()=>void refresh()} tracks={tracks} shareTrack={shareTrack} onShared={onShared} playTrack={playTrack}/> : <div class="friends-conversation-placeholder"><MessageCircle size={28}/><p>Choose a friend to talk or invite them to listen.</p></div>}
    </div>
    {confirm&&<Modal title={`${confirm.action==='block'?'Block':'Remove'} ${confirm.member.display_name}?`} close={()=>{if(!busy)setConfirm(null);}}><p>{confirm.action==='block'?'They won’t be able to send you messages or friend requests.':'You’ll need to become friends again to message each other.'}</p><div class="friend-confirm-actions"><button class="secondary" autoFocus disabled={busy} onClick={()=>setConfirm(null)}>Cancel</button><button class="danger" disabled={busy} onClick={()=>void change(confirm.member,confirm.action)}>{busy?'Saving…':confirm.action==='block'?'Block member':'Remove friend'}</button></div></Modal>}
  </section>;
}

function FriendConversation({userId,peer,close,getRoomInvite,joinRoom,revoked,tracks,shareTrack,onShared,playTrack}: {
  userId:string;peer:ArchiveMember;close:()=>void;getRoomInvite:()=>Promise<string|null>;joinRoom:(id:string)=>Promise<void>;revoked:()=>void;
  tracks:Track[];shareTrack?:Track|null;onShared?:()=>void;playTrack:(id:string)=>void;
}) {
  const [messages,setMessages] = useState<FriendMessage[]>([]), [draft,setDraft] = useState('');
  const [error,setError] = useState(''), [loading,setLoading] = useState(true), [sending,setSending] = useState(false), [allowed,setAllowed] = useState(true);
  const pending = useRef<PendingFriendMessage|null>(null), live = useRef(true), sequence = useRef(0), log = useRef<HTMLDivElement>(null), follow = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  async function refresh() {
    const request = ++sequence.current;
    try {
      const data = await rpc('friend_conversation',{p_peer:peer.user_id});
      if(!live.current||request!==sequence.current)return;
      setMessages(data.messages);setAllowed(true);setError('');
    } catch(e) {
      if(!live.current||request!==sequence.current)return;
      if((e as {code?:string}).code==='42501'){setMessages([]);setAllowed(false);revoked();}
      setError(friendError(e));
    } finally {if(live.current&&request===sequence.current)setLoading(false);}
  }
  useEffect(()=>{
    live.current=true;void refresh();input.current?.focus();
    const resume=()=>{if(document.visibilityState==='visible')void refresh();};
    const timer=window.setInterval(resume,10000);
    window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
    return()=>{live.current=false;sequence.current++;window.clearInterval(timer);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
  },[userId,peer.user_id]);
  useEffect(()=>{if(follow.current&&log.current)log.current.scrollTop=log.current.scrollHeight;},[messages]);
  async function send(invite=false) {
    if(sending||!allowed)return;
    setSending(true);setError('');sequence.current++;
    try {
      const room=invite?(localPreview?'preview-room':await getRoomInvite()):null;
      if(!live.current||(invite&&!room))return;
      const message=prepareFriendMessage(pending.current,peer.user_id,invite?'Come listen with me.':draft,room,invite?null:shareTrack?.id||null);
      pending.current=message;
      await rpc('send_friend_message',{p_peer:peer.user_id,p_id:message.id,p_body:message.body,p_room:message.room,p_track:message.track});
      if(!live.current)return;
      pending.current=null;if(!invite)setDraft('');if(message.track)onShared?.();follow.current=true;await refresh();
    } catch(e) {if(live.current)setError(e instanceof Error?e.message:friendError(e));}
    finally{if(live.current){setSending(false);input.current?.focus();}}
  }
  return <section class="friend-conversation" aria-label={`Conversation with ${peer.display_name}`}>
    <header><IconButton label="Back to friends" onClick={close}><ArrowLeft size={20}/></IconButton><h2>{peer.display_name}</h2><button class="secondary" disabled={sending||!allowed} onClick={()=>void send(true)}>Invite to listen</button></header>
    <div class="friend-message-log" ref={log} role="log" aria-label={`Messages with ${peer.display_name}`} aria-live="polite" aria-relevant="additions" onScroll={()=>{const e=log.current!;follow.current=e.scrollHeight-e.scrollTop-e.clientHeight<60;}}>
      {!messages.length&&<p class="friends-empty">{loading?'Loading messages…':allowed?'Say something.':'This conversation is unavailable.'}</p>}
      {messages.map(message=>{
        const track=tracks.find(t=>t.id===message.track_id);
        return <article key={message.id} class={`friend-message ${message.sender_id===userId?'is-own':''}`}>
          <div><strong>{message.sender_id===userId?'You':peer.display_name}</strong><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div>
          {message.body&&<p>{message.body}</p>}
          {message.is_song&&(track?<button class="friend-song" disabled={!track.available} onClick={()=>playTrack(track.id)}><span><strong>{track.title}</strong>{trackCreditLabel(track)&&<small>{trackCreditLabel(track)}</small>}</span><span>{track.available?'Play':'Unavailable'}</span></button>:<span class="friend-expired">Song unavailable</span>)}
          {message.is_invite&&(message.room_id&&message.room_active?<button class="secondary" disabled={sending} onClick={async()=>{
            setSending(true);
            try{if(localPreview){setError('Room joining is available in the signed-in app.');return;}await joinRoom(message.room_id!);}
            catch(e){if(live.current)setError(e instanceof Error?e.message:friendError(e));}
            finally{if(live.current)setSending(false);}
          }}>Join listening room</button>:<span class="friend-expired">Room ended</span>)}
        </article>;
      })}
    </div>
    {error&&<div class="friends-error" role="alert"><p>{error}</p><button class="text-button" onClick={()=>void refresh()}>Reload conversation</button></div>}
    <form class="friend-compose" onSubmit={e=>{e.preventDefault();void send();}}>
      {shareTrack&&<div class="friend-song-draft"><span>Send <strong>{shareTrack.title}</strong></span><button type="button" class="text-button" disabled={sending} onClick={onShared}>Remove song</button></div>}
      <label htmlFor="friend-message">Message {peer.display_name}{shareTrack?' (optional)':''}</label>
      <div><textarea id="friend-message" ref={input} rows={2} value={draft} maxLength={2000} disabled={sending||!allowed} onBlur={()=>{if(Array.from(draft.trim()).length>1000)setError('Keep your message within 1,000 characters.');}} onInput={e=>{setDraft(e.currentTarget.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();void send();}}}/><button type="submit" class="primary" disabled={sending||!allowed||(!draft.trim()&&!shareTrack)}><Send size={18}/>{sending?'Sending…':'Send'}</button></div>
      <small>Recent messages · latest 100 from the last 90 days</small>
    </form>
  </section>;
}
