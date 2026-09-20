/* Word data operations - runs in the browser, talks straight to Supabase.
 *
 * The spaced-repetition rule (matches the previous Python backend):
 *   "Got it"  -> mark passed_on = today; the word leaves today's queue, and
 *                its box advances (box 0..5 => 10min, 1d, 3d, 7d, 16d, 35d).
 *   "Not yet" -> box resets to 0 and passed_on clears, so the word returns to
 *                today's queue.
 */
var BOX_MINUTES = [10, 1440, 4320, 10080, 23040, 50400];   // 10m,1d,3d,7d,16d,35d
var MAX_BOX = BOX_MINUTES.length - 1;

function todayStr() {
  // Local calendar date, so "today" matches the user's clock.
  var d = new Date();
  return d.getFullYear() + '-' +
         ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
         ('0' + d.getDate()).slice(-2);
}

function isoUtc(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function nowIso() { return isoUtc(Date.now()); }

/* ---------- reading ---------- */

function fetchBatch(limit) {
  limit = limit || 50;
  var today = todayStr();
  var now = encodeURIComponent(nowIso());
  var q = '/words?select=*' +
          '&status=eq.learning' +
          '&next_review=lte.' + now +
          '&or=(passed_on.is.null,passed_on.lt.' + today + ')' +
          '&order=next_review.asc' +
          '&limit=' + limit;
  var dueP = sbFetch(q);
  var allP = sbFetch('/words?select=id,status,passed_on');
  return Promise.all([dueP, allP]).then(function(res) {
    var due = res[0] || [];
    var all = res[1] || [];
    var total = 0, passed = 0, removed = 0;
    for (var i = 0; i < all.length; i++) {
      if (all[i].status === 'learning') {
        total++;
        if (all[i].passed_on === today) passed++;
      } else {
        removed++;
      }
    }
    return { words: due, total: total, passed_today: passed,
             removed: removed, today: today };
  });
}

function fetchAll(includeRemoved) {
  var q = '/words?select=*&order=wrong_count.desc,word.asc';
  if (!includeRemoved) q += '&status=eq.learning';
  return sbFetch(q).then(function(r) { return r || []; });
}

/* ---------- writing ---------- */

function addWord(word, meaningOverride) {
  word = (word || '').trim();
  if (!word) return Promise.reject(new Error('empty word'));

  return sbFetch('/words?select=*&word=eq.' + encodeURIComponent(word))
    .then(function(found) {
      var existing = (found && found[0]) || null;
      if (existing) {
        if (existing.status === 'removed') {
          return sbFetch('/words?id=eq.' + existing.id, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify({ status: 'learning', box: 0,
                                   passed_on: null, next_review: nowIso() })
          }).then(function() {
            return { word: word, action: 'restored' };
          });
        }
        return { word: word, action: 'exists' };
      }

      var lookupP = meaningOverride
        ? Promise.resolve({ meaning: meaningOverride })
        : lookupWord(word).catch(function() { return {}; });

      return lookupP.then(function(info) {
        info = info || {};
        var row = {
          word: word,
          phonetic: info.phonetic || null,
          pos: info.pos || null,
          meaning: info.meaning || null,
          example: info.example || null,
          example_cn: info.example_cn || null,
          status: 'learning',
          box: 0,
          passed_on: null,
          next_review: nowIso()
        };
        return sbFetch('/words', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(row)
        }).then(function(created) {
          var rec = (created && created[0]) || row;
          return { word: word, action: 'added', meaning: rec.meaning,
                   phonetic: rec.phonetic, id: rec.id };
        });
      });
    });
}

function answerWord(word, correct) {
  var box = word.box || 0;
  var right = word.right_count || 0;
  var wrong = word.wrong_count || 0;
  var patch = { last_review: nowIso() };

  if (correct) {
    box = Math.min(box + 1, MAX_BOX);
    right += 1;
    patch.box = box;
    patch.right_count = right;
    patch.passed_on = todayStr();
    patch.next_review = isoUtc(Date.now() + BOX_MINUTES[box] * 60000);
  } else {
    box = 0;
    wrong += 1;
    patch.box = 0;
    patch.wrong_count = wrong;
    patch.passed_on = null;
    patch.next_review = nowIso();
  }

  return sbFetch('/words?id=eq.' + word.id, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify(patch)
  }).then(function() {
    return { id: word.id, correct: correct, box: box };
  });
}

function removeWord(word) {
  return sbFetch('/words?word=eq.' + encodeURIComponent(word), {
    method: 'PATCH',
    body: JSON.stringify({ status: 'removed' })
  }).then(function() { return { word: word, action: 'removed' }; });
}

function practiceAll() {
  return sbFetch('/words?status=eq.learning', {
    method: 'PATCH',
    body: JSON.stringify({ next_review: nowIso(), passed_on: null })
  }).then(function() { return { action: 'practice_all' }; });
}
