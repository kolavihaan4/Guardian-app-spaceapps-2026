/* Signing in, for the whole site. One Supabase client is made here and shared by the home site and
   the health app (both index.html files load this file after the vendored supabase-js): who is signed
   in, signing up, in and out, the access token sent to /api, and the person's cards all go through
   window.GuardianAuth. Nothing else talks to Supabase.
   The key below is the project's publishable key: public by design, and safe in a page. What a
   signed-in person can read or change is decided in the database (row level security), not here. */
(function () {
  const SUPABASE_URL = 'https://azeehmngjcnpqtjoofzs.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_6A3puluLFzqez8yu3TdzIg_uaFZDVJX';
  const MIN_PASSWORD = 8;
  const BATCH = 100;   // cards per request, so a long list never makes an over-long address

  let client = null;
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
    }
  } catch (e) { client = null; }

  const TOO_SHORT = 'Use a password of at least ' + MIN_PASSWORD + ' characters.';

  // Supabase's errors, in plain words. The person sees one of these, never Supabase's own text.
  function plain(err) {
    const e = err || {};
    const code = String(e.code || e.error_code || '');
    const msg = String(e.message || e.msg || '');
    const status = Number(e.status) || 0;
    if (status === 429 || /rate_limit/.test(code) || /rate limit|too many/i.test(msg)) return 'Too many attempts. Wait a minute, then try again.';
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'That email and password do not match. Check them and try again.';
    if (code === 'user_already_exists' || code === 'email_exists' || /already (been )?registered|already exists/i.test(msg)) return 'An account with this email already exists. Sign in instead.';
    if (code === 'weak_password' || /password should be/i.test(msg)) return TOO_SHORT;
    if (code === 'email_address_invalid' || /(invalid.*email|email.*invalid)/i.test(msg)) return 'That email address does not look right.';
    if (code === 'signup_disabled') return 'New accounts cannot be made right now.';
    if (e.name === 'AuthRetryableFetchError' || /failed to fetch|network|load failed/i.test(msg)) return 'Could not reach the sign-in service. Check your connection and try again.';
    return 'Something went wrong. Please try again.';
  }
  const failure = err => Object.assign(new Error(plain(err)), { code: err && err.code, status: err && err.status });
  const unavailable = () => new Error('Sign-in is not available right now. Please reload the page.');
  const userOf = s => (s && s.user ? { id: String(s.user.id), email: s.user.email ? String(s.user.email) : '' } : null);

  function session() {
    if (!client) return Promise.resolve(null);
    return client.auth.getSession().then(r => (r && r.data && r.data.session) || null, () => null);
  }

  /** Why a new password is refused before it is sent, or null when it is long enough. */
  function passwordProblem(password) {
    return String(password || '').length < MIN_PASSWORD ? TOO_SHORT : null;
  }

  async function signUp(email, password) {
    const problem = passwordProblem(password);
    if (problem) throw new Error(problem);   // refused here: nothing is sent
    if (!client) throw unavailable();
    const { data, error } = await client.auth.signUp({ email: String(email || '').trim(), password: String(password) });
    if (error) throw failure(error);
    // where Supabase hides that an email is taken, it answers with a user who has no identities
    if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw failure({ code: 'user_already_exists' });
    if (data && data.user) { try { localStorage.setItem('guardian.tour.pending.' + data.user.id, '1'); } catch (e) { /* optional tutorial preference */ } }
    if (!data || !data.session) throw new Error('Your account was made, but you are not signed in yet. Sign in to continue.');
    return userOf(data.session);
  }

  async function signIn(email, password) {
    if (!client) throw unavailable();
    const { data, error } = await client.auth.signInWithPassword({ email: String(email || '').trim(), password: String(password || '') });
    if (error) throw failure(error);
    return userOf(data && data.session);
  }

  // Work that must finish before the session ends (cards not saved yet: js/store.js). Given 4 s at most.
  const beforeEnd = new Set();
  function settleFirst() {
    const all = Array.from(beforeEnd, f => Promise.resolve().then(f).catch(() => {}));
    return Promise.race([Promise.all(all), new Promise(r => setTimeout(r, 4000))]);
  }

  async function signOut() {
    if (!client) return;
    await settleFirst();
    const r = await client.auth.signOut().catch(e => ({ error: e }));
    // the server could not be told: this browser forgets the session all the same
    if (r && r.error) await client.auth.signOut({ scope: 'local' }).catch(() => {});
  }

  /**
   * Deletes the signed-in person's account. Guardian's server deletes its copy first (their health
   * data): once Supabase has forgotten the person, the server can no longer tell who is asking, so
   * that order is the one that cannot leave data behind. A server without that route (404) has
   * nothing to delete. Then Supabase deletes the sign-in, and the cards with it, and this browser
   * signs out. Nothing is deleted from Supabase if the server's part fails.
   */
  async function deleteAccount() {
    if (!client) throw unavailable();
    const s = await session();
    if (!s) throw new Error('You are not signed in.');
    let res;
    try {
      res = await fetch('/api/me', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json', authorization: 'Bearer ' + s.access_token },
        body: JSON.stringify({ confirm: 'DELETE' })
      });
    } catch (e) { res = null; }
    if (!res || (!res.ok && res.status !== 404)) throw new Error('Could not delete your health data, so the account was kept. Please try again.');
    const { error } = await client.rpc('delete_my_account');
    if (error) throw new Error('Your health data was deleted, but the account could not be. Please try again.');
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
    return userOf(s);
  }

  /** Calls fn(user or null, event) whenever sign-in changes (also from another tab). Returns a stop function. */
  function onChange(fn) {
    if (!client) return () => {};
    // handed on a moment later: calling the client again from inside its own callback can deadlock it
    const { data } = client.auth.onAuthStateChange((event, s) => { setTimeout(() => fn(userOf(s), event), 0); });
    return () => { try { data.subscription.unsubscribe(); } catch (e) { /* already stopped */ } };
  }

  const chunks = list => { const out = []; for (let i = 0; i < list.length; i += BATCH) out.push(list.slice(i, i + BATCH)); return out; };
  const sequence = (list, f) => chunks(list).reduce((p, part) => p.then(() => f(part)), Promise.resolve());
  const check = r => { if (r && r.error) throw r.error; return r; };

  // The signed-in person's cards, in the `cards` table: one row per card, { id, body }. Row level
  // security keeps each person to their own rows; these calls also name the owner, to be explicit.
  const cards = {
    /** Every card of the signed-in person: [{ id, body }]. */
    list() {
      if (!client) return Promise.reject(unavailable());
      return client.from('cards').select('id, body').then(check).then(r => (Array.isArray(r.data) ? r.data : []));
    },
    /** Saves cards, [{ id, body }], adding new ones and replacing the rest. */
    async save(rows) {
      if (!rows || !rows.length) return;
      if (!client) throw unavailable();
      const s = await session();
      if (!s) throw new Error('You are not signed in.');
      await sequence(rows, part => client.from('cards')
        .upsert(part.map(r => ({ user_id: s.user.id, id: r.id, body: r.body })), { onConflict: 'user_id,id' }).then(check));
    },
    /** Deletes the signed-in person's cards with these ids. */
    async remove(ids) {
      if (!ids || !ids.length) return;
      if (!client) throw unavailable();
      await sequence(ids, part => client.from('cards').delete().in('id', part).then(check));
    },
    /** Deletes every card of the signed-in person. */
    async removeAll() {
      if (!client) throw unavailable();
      const s = await session();
      if (!s) return;
      await client.from('cards').delete().eq('user_id', s.user.id).then(check);
    }
  };

  window.GuardianAuth = {
    MIN_PASSWORD,
    /** Whether the Supabase client loaded. */
    available: !!client,
    /** The signed-in person, { id, email }, or null. */
    user() { return session().then(userOf); },
    /** The current access token, or null. */
    token() { return session().then(s => (s ? s.access_token : null)); },
    /** Headers for a call to Guardian's /api: the bearer token when someone is signed in. */
    headers() { return session().then(s => (s ? { authorization: 'Bearer ' + s.access_token } : {})); },
    signUp,
    signIn,
    signOut,
    deleteAccount,
    onChange,
    /** Runs fn (and waits for it, briefly) before a sign-out. Returns a function that undoes this. */
    beforeSignOut(fn) { beforeEnd.add(fn); return () => beforeEnd.delete(fn); },
    passwordProblem,
    message: plain,
    cards
  };
})();
