/* Where the crew is: the answer to "Where is your crew?". One rule, used by the home site and the
   health app alike:
     - signed out: the choice lasts for this tab only, so the site asks again on the next visit;
     - signed in: the choice is also saved for that account in this browser and comes back next time.
   Nothing else may read or write the location: go through window.GuardianEnv. */
(function () {
  const IDS = ['iss', 'mars', 'moon', 'spacecraft'];
  const VISIT = 'guardian.env';   // sessionStorage: this visit, whoever it is
  const SAVED = 'guardian.env.';  // localStorage, followed by the user id: one saved choice per account
  const OLD = 'still.v1';         // the home site's state; it used to keep `env` for everyone

  const valid = v => (IDS.indexOf(v) >= 0 ? v : null);
  // storage can be blocked or full; the location is then simply not kept
  function read(area, key) { try { return valid(window[area].getItem(key)); } catch (e) { return null; } }
  function write(area, key, v) { try { window[area].setItem(key, v); } catch (e) { /* not kept */ } }
  function drop(area, key) { try { window[area].removeItem(key); } catch (e) { /* nothing to remove */ } }

  let user = null;          // the signed-in user's id, once sign-in is known (js/auth.js)
  let chosenHere = false;   // a location was chosen on this page before that answer came

  // A location saved under the old rule. It is held until we know whether anyone is signed in:
  // theirs if so, dropped if not (it was saved without a sign-in).
  let old = null;
  try { old = valid((JSON.parse(localStorage.getItem(OLD) || 'null') || {}).env); } catch (e) { /* unreadable */ }
  function stripOld() {
    try {
      const s = JSON.parse(localStorage.getItem(OLD) || 'null');
      if (s && typeof s === 'object' && 'env' in s) { delete s.env; localStorage.setItem(OLD, JSON.stringify(s)); }
    } catch (e) { /* unreadable or blocked */ }
  }

  window.GuardianEnv = {
    ids: IDS,

    /** The location for this visit, or null when none has been chosen yet. */
    get() { return read('sessionStorage', VISIT); },

    /** The signed-in user's id, or null. Null until account() has been called. */
    user() { return user; },

    /** Records a choice: always for this visit, and for the account when someone is signed in. */
    choose(v) {
      v = valid(v);
      if (!v) return;
      write('sessionStorage', VISIT, v);
      if (user) write('localStorage', SAVED + user, v);
      else chosenHere = true;
    },

    /**
     * Call once /api/me has answered: the user's id, or null when nobody is signed in.
     * Returns the location to use: this visit's, else the one saved for that account, else null.
     * `justSignedIn` is for the moment after the sign-in form: a location already chosen this visit
     * is then saved for the account.
     */
    account(id, justSignedIn) {
      user = id == null || id === '' ? null : String(id);
      const before = old;
      old = null;
      stripOld();
      const visit = read('sessionStorage', VISIT);
      const late = chosenHere;   // only the first answer can arrive after a choice it did not know about
      chosenHere = false;
      if (!user) return visit;
      if (before && !read('localStorage', SAVED + user)) write('localStorage', SAVED + user, before);
      if (visit) {
        if (justSignedIn || late) write('localStorage', SAVED + user, visit);
        return visit;
      }
      const saved = read('localStorage', SAVED + user);
      if (saved) write('sessionStorage', VISIT, saved);
      return saved;
    },

    /** Signing out: this visit's location goes, so the next person is asked. The account's stays. */
    signOut() { user = null; chosenHere = false; drop('sessionStorage', VISIT); },

    /** Deleting an account or its data: its saved location goes too. */
    forget(id) { if (id != null && id !== '') drop('localStorage', SAVED + String(id)); },

    /** Who is signed in, from the Supabase session (js/auth.js): the user's id, or null (signed out or an error). */
    whoAmI() {
      try {
        const auth = window.GuardianAuth;
        if (!auth) return Promise.resolve(null);
        return auth.user().then(u => (u && u.id ? String(u.id) : null), () => null);
      } catch (e) { return Promise.resolve(null); }
    }
  };
})();
