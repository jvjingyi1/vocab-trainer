/* Dictionary lookup via Youdao's public endpoints.
 *
 * Direct fetch() is blocked by CORS (Youdao returns 403 for cross-origin
 * requests), but the endpoint supports JSONP, which loads as a <script> tag
 * and is not subject to CORS. That is how this works from a static page.
 */
var _jsonpSeq = 0;

function jsonp(url, timeoutMs) {
  timeoutMs = timeoutMs || 8000;
  return new Promise(function(resolve, reject) {
    var name = '__youdao_cb_' + (++_jsonpSeq) + '_' + Date.now();
    var script = document.createElement('script');
    var timer = setTimeout(function() { cleanup(); reject(new Error('timeout')); }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      try { delete window[name]; } catch (e) { window[name] = undefined; }
    }

    window[name] = function(data) {
      cleanup();
      resolve(data);
    };
    script.onerror = function() { cleanup(); reject(new Error('script load failed')); };
    script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + name;
    document.head.appendChild(script);
  });
}

function _explainUrl(word) {
  return 'https://dict.youdao.com/suggest?q=' + encodeURIComponent(word) +
         '&num=1&doctype=json';
}

/* Simple lookup: part-of-speech + Chinese meaning. */
function lookupSimple(word) {
  return jsonp(_explainUrl(word)).then(function(res) {
    var entries = (res && res.data && res.data.entries) || [];
    return entries.length ? entries[0].explain : null;
  });
}

/* Full lookup: meaning, phonetic, and an example sentence. */
function lookupWord(word) {
  var out = { word: word, phonetic: null, pos: null, meaning: null,
              example: null, example_cn: null };

  // Youdao's richer endpoint does not support JSONP, so the meaning comes from
  // suggest. The example sentence is best-effort and simply omitted on failure.
  return lookupSimple(word).then(function(explain) {
    if (explain) {
      out.meaning = explain;
      var m = explain.match(/^\s*([a-z]{1,6})\./);
      if (m) out.pos = m[1] + '.';
    }
    return out;
  });
}

function voiceUrl(word, accent) {
  return 'https://dict.youdao.com/dictvoice?audio=' +
         encodeURIComponent(word) + '&type=' + (accent || 2);
}
