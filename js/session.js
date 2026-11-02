/* session.js — the access role behind the site gate, read once per load. */
(function (TA) {
  'use strict';

  var role = null;
  var pending = null;

  function load() {
    if (pending) return pending;
    var fetchImpl = typeof window !== 'undefined' && window.fetch;
    if (!fetchImpl) {
      pending = Promise.resolve(null);
      return pending;
    }
    pending = fetchImpl('/api/session', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      return res.ok ? res.json() : null;
    }).then(function (data) {
      role = data && (data.role === 'owner' || data.role === 'member') ? data.role : null;
      return role;
    }).catch(function () {
      role = null;
      return null;
    });
    return pending;
  }

  TA.session = {
    load: load,
    role: function () { return role; },
    isOwner: function () { return role === 'owner'; }
  };
})(window.TA = window.TA || {});
