/* App shell: lock screen, tabs, review flow. */

var I18N = {
  en: {
    tab_review: 'Review', tab_add: 'Add', tab_list: 'Library',
    stat_due: 'Left today', stat_passed: 'Passed today', stat_total: 'In library',
    mode_en2cn: 'English → Chinese', mode_cn2en: 'Chinese → Spell',
    btn_know: 'Got it', btn_no: 'Not yet', btn_reveal: 'Show answer',
    btn_add: 'Add words', btn_check: 'Check', unlock: 'Unlock',
    lock_hint: 'Enter your passphrase', lock_wrong: 'Wrong passphrase.',
    review_empty: 'Nothing due right now. Add some words or come back later.',
    all_done: 'Today\'s goal complete.',
    list_empty: 'Your library is empty.',
    add_ph: 'Type words, one per line or separated by commas.\nDefinitions are fetched automatically.',
    spell_ph: 'Type the English word',
    added: 'Added', exists: 'Already in library', restored: 'Restored',
    removed: 'Removed from library', remove: 'Remove',
    loading: 'Looking up…', type_first: 'Type something first.',
    correct: 'Correct!', wrong: 'Wrong — answer: ',
    btn_practice_all: 'Practice everything now',
    practicing: 'All words queued for practice.',
    no_definition: '(no definition found)'
  },
  zh: {
    tab_review: '复习', tab_add: '添加', tab_list: '词库',
    stat_due: '今日剩余', stat_passed: '今日已会', stat_total: '词库总数',
    mode_en2cn: '看英文想中文', mode_cn2en: '看中文拼英文',
    btn_know: '会了', btn_no: '不会', btn_reveal: '显示答案',
    btn_add: '添加单词', btn_check: '检查', unlock: '解锁',
    lock_hint: '请输入密码', lock_wrong: '密码不对。',
    review_empty: '现在没有待复习的词。去添加一些，或稍后再来。',
    all_done: '今日目标已完成。',
    list_empty: '词库还是空的。',
    add_ph: '每行一个单词，或用逗号分隔。\n释义自动联网获取。',
    spell_ph: '输入英文单词',
    added: '已添加', exists: '词库里已有', restored: '已恢复',
    removed: '已移出词库', remove: '移出',
    loading: '正在查询…', type_first: '请先输入内容。',
    correct: '答对了！', wrong: '答错了——正确答案：',
    btn_practice_all: '立刻全部练一遍',
    practicing: '全部单词已排入练习队列。',
    no_definition: '（没查到释义）'
  }
};

var lang = 'en';
var mode = 'en2cn';
var queue = [];
var sessionTotal = 0;
var passedCount = 0;
var current = null;
var revealed = false;
var pendingSync = [];

function t(k) { return (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k; }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.classList.remove('show'); }, 2200);
}

function applyI18n() {
  var nodes = document.querySelectorAll('[data-i18n]');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
  }
  document.getElementById('addInput').placeholder = t('add_ph');
  document.getElementById('spellInput').placeholder = t('spell_ph');
  document.getElementById('lockHint').textContent = t('lock_hint');
  document.getElementById('btnUnlock').textContent = t('unlock');
  document.getElementById('langBtn').textContent = (lang === 'en' ? '中文' : 'EN');
  document.getElementById('btnKnow').textContent = t('btn_know');
  document.getElementById('btnNo').textContent = t('btn_no');
  if (mode === 'en2cn') {
    document.getElementById('btnReveal').textContent = t('btn_reveal');
  } else {
    document.getElementById('btnReveal').textContent = t('btn_check');
  }
}

/* ---------- unlock ---------- */

document.getElementById('btnUnlock').onclick = doUnlock;
document.getElementById('passInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doUnlock();
});

function doUnlock() {
  var pw = document.getElementById('passInput').value;
  var err = document.getElementById('lockErr');
  if (!pw) { err.textContent = t('type_first'); return; }
  err.textContent = '';
  document.getElementById('btnUnlock').textContent = '...';
  tryUnlock(pw).then(function(ok) {
    document.getElementById('btnUnlock').textContent = t('unlock');
    if (!ok) { err.textContent = t('lock_wrong'); return; }
    enterApp();
  }).catch(function(e) {
    document.getElementById('btnUnlock').textContent = t('unlock');
    err.textContent = String(e.message || e);
  });
}

document.getElementById('btnLock').onclick = function() {
  lockOut();
  document.getElementById('passInput').value = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('lockScreen').style.display = 'flex';
};

function enterApp() {
  document.getElementById('lockScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  applyI18n();
  loadStatsAndReview();
}

/* ---------- tabs ---------- */

var navBtns = document.querySelectorAll('nav button');
for (var i = 0; i < navBtns.length; i++) {
  navBtns[i].onclick = function() {
    for (var j = 0; j < navBtns.length; j++) navBtns[j].classList.remove('on');
    this.classList.add('on');
    var v = this.getAttribute('data-view');
    var views = document.querySelectorAll('.view');
    for (var k = 0; k < views.length; k++) views[k].classList.remove('on');
    document.getElementById('view-' + v).classList.add('on');
    if (v === 'review') loadReview(false);
    if (v === 'list') loadList();
  };
}

document.getElementById('langBtn').onclick = function() {
  lang = (lang === 'en') ? 'zh' : 'en';
  applyI18n();
  if (current) renderCard();
};

var modeBtns = document.querySelectorAll('.mode-box button');
for (var i = 0; i < modeBtns.length; i++) {
  modeBtns[i].onclick = function() {
    for (var j = 0; j < modeBtns.length; j++) modeBtns[j].classList.remove('on');
    this.classList.add('on');
    mode = this.getAttribute('data-mode');
    applyI18n();
    if (current) { revealed = false; renderCard(); }
  };
}

/* ---------- review ---------- */

function loadStatsAndReview() { loadReview(false); }

function loadReview(force) {
  if (queue.length && !force) { showNext(); return; }
  var l = document.getElementById('loading');
  l.textContent = '';
  fetchBatch(50).then(function(d) {
    queue = d.words || [];
    sessionTotal = queue.length + (d.passed_today || 0);
    passedCount = d.passed_today || 0;
    document.getElementById('statTotal').textContent = d.total;
    updateProgress();
    if (!queue.length) { showEmpty(); return; }
    showNext();
  }).catch(function(e) {
    l.textContent = String(e.message || e);
  });
}

function updateProgress() {
  var pct = sessionTotal ? Math.round(100 * passedCount / sessionTotal) : 0;
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('statDue').textContent = queue.length;
  document.getElementById('statPassed').textContent = passedCount;
}

function showEmpty() {
  current = null;
  document.getElementById('reviewCard').classList.add('hidden');
  document.getElementById('answerRow').classList.add('hidden');
  document.getElementById('btnReveal').classList.add('hidden');
  document.getElementById('progressBar').style.width = '100%';
  var box = document.getElementById('reviewEmpty');
  box.classList.remove('hidden');
  box.innerHTML =
    '<div style="margin-bottom:14px">' +
    (sessionTotal ? t('all_done') : t('review_empty')) + '</div>' +
    '<button class="ghost" id="btnPracticeAll" style="width:auto;padding:10px 18px">' +
    t('btn_practice_all') + '</button>';
  var pb = document.getElementById('btnPracticeAll');
  if (pb) pb.onclick = function() {
    practiceAll().then(function() { toast(t('practicing')); loadReview(true); });
  };
}

function showNext() {
  if (!queue.length) { loadReview(true); return; }
  current = queue[0];
  revealed = false;
  document.getElementById('reviewCard').classList.remove('hidden');
  document.getElementById('answerRow').classList.remove('hidden');
  document.getElementById('btnReveal').classList.remove('hidden');
  document.getElementById('reviewEmpty').classList.add('hidden');
  renderCard();
}

function renderCard() {
  var w = current;
  if (!w) return;
  var rw = document.getElementById('rw');
  var rphon = document.getElementById('rphon');
  var rpos = document.getElementById('rpos');
  var rmean = document.getElementById('rmean');
  var rex = document.getElementById('rex');
  var spell = document.getElementById('spellInput');
  var verdict = document.getElementById('verdict');
  var row = document.getElementById('answerRow');
  var reveal = document.getElementById('btnReveal');

  verdict.textContent = '';
  verdict.className = 'verdict';

  if (mode === 'en2cn') {
    rw.className = 'word';
    rw.textContent = w.word;
    rphon.textContent = w.phonetic || '';
    rpos.textContent = revealed ? (w.pos || '') : '';
    rmean.classList.toggle('hidden', !revealed);
    rmean.textContent = revealed ? (w.meaning || t('no_definition')) : '';
    rex.classList.toggle('hidden', !revealed || !w.example);
    rex.innerHTML = w.example
      ? '<div class="ex-en">' + esc(w.example) + '</div><div>' + esc(w.example_cn || '') + '</div>'
      : '';
    spell.classList.add('hidden');
    row.classList.remove('hidden');
    reveal.classList.toggle('hidden', revealed);
    reveal.textContent = t('btn_reveal');
  } else {
    rw.className = 'word cn';
    rw.textContent = w.meaning || t('no_definition');
    rphon.textContent = w.phonetic || '';
    rpos.textContent = '';
    rmean.classList.add('hidden');
    rex.classList.add('hidden');
    spell.classList.remove('hidden');
    spell.value = '';
    row.classList.add('hidden');
    reveal.classList.remove('hidden');
    reveal.textContent = t('btn_check');
    setTimeout(function() { spell.focus(); }, 50);
  }
}

/* ---------- answering ---------- */

function submitAnswer(correct) {
  if (!current) return;
  var word = current;
  queue.shift();
  if (correct) { passedCount++; } else { queue.push(word); }
  updateProgress();
  answerWord(word, correct).catch(function() {});   // fire and forget
  showNext();
}

document.getElementById('btnKnow').onclick = function() {
  if (current) submitAnswer(true);
};
document.getElementById('btnNo').onclick = function() {
  if (current) submitAnswer(false);
};
document.getElementById('btnReveal').onclick = function() {
  if (!current) return;
  if (mode === 'en2cn') {
    revealed = true;
    renderCard();
  } else {
    var typed = document.getElementById('spellInput').value.trim().toLowerCase();
    if (!typed) { toast(t('type_first')); return; }
    var ok = typed === current.word.toLowerCase();
    var v = document.getElementById('verdict');
    if (ok) {
      v.textContent = t('correct');
      v.className = 'verdict ok';
      setTimeout(function() { submitAnswer(true); }, 550);
    } else {
      v.textContent = t('wrong') + current.word;
      v.className = 'verdict no';
      setTimeout(function() { submitAnswer(false); }, 2000);
    }
  }
};
document.getElementById('spellInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('btnReveal').click();
});

/* ---------- pronunciation ---------- */

document.getElementById('btnSpeak').onclick = function() {
  if (!current) return;
  var url = voiceUrl(current.word, 2);
  var host = document.getElementById('audioHost');
  host.innerHTML = '';
  var a = document.createElement('audio');
  a.src = url;
  a.autoplay = true;
  host.appendChild(a);
  a.play().catch(function() {
    // Fallback: open the mp3 directly if autoplay is blocked.
    window.open(url, '_blank');
  });
};

/* ---------- add ---------- */

document.getElementById('btnAdd').onclick = function() {
  var txt = document.getElementById('addInput').value.trim();
  if (!txt) { toast(t('type_first')); return; }
  var msg = document.getElementById('addMsg');
  msg.textContent = t('loading');

  var words = [];
  txt.replace(/,/g, '\n').split('\n').forEach(function(w) {
    w = w.trim();
    if (w && words.indexOf(w) < 0) words.push(w);
  });

  var results = [];
  var chain = Promise.resolve();
  words.forEach(function(w) {
    chain = chain.then(function() {
      return addWord(w).then(function(r) { results.push(r); });
    });
  });

  chain.then(function() {
    msg.textContent = '';
    document.getElementById('addInput').value = '';
    var html = '';
    results.forEach(function(r) {
      var label = t(r.action) || r.action;
      html += '<div class="card"><b>' + esc(r.word) + '</b> ' +
              '<span class="badge">' + esc(label) + '</span>' +
              (r.meaning
                ? '<div style="color:#8d97a8;font-size:14px;margin-top:6px">' +
                  esc(r.meaning.slice(0, 120)) + '</div>'
                : '') +
              '</div>';
    });
    document.getElementById('addResults').innerHTML = html;
    loadReview(true);
  }).catch(function(e) {
    msg.textContent = String(e.message || e);
  });
};

/* ---------- library ---------- */

function loadList() {
  fetchAll(false).then(function(words) {
    var ul = document.getElementById('wordList');
    ul.innerHTML = '';
    var empty = document.getElementById('listEmpty');
    if (!words.length) {
      empty.classList.remove('hidden');
      empty.textContent = t('list_empty');
      return;
    }
    empty.classList.add('hidden');
    words.forEach(function(w) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="w">' + esc(w.word) + '</span>' +
                     '<span class="m">' + esc(w.meaning || '') + '</span>' +
                     '<span class="badge">' + (w.passed_on === todayStr() ? '✓' : 'box' + (w.box || 0)) + '</span>';
      var btn = document.createElement('button');
      btn.className = 'rm';
      btn.textContent = t('remove');
      btn.onclick = function() {
        removeWord(w.word).then(function() {
          toast(t('removed'));
          loadList();
          loadReview(true);
        });
      };
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }).catch(function(e) {
    document.getElementById('listEmpty').classList.remove('hidden');
    document.getElementById('listEmpty').textContent = String(e.message || e);
  });
}

/* ---------- boot ---------- */

applyI18n();
restoreSession().then(function(ok) {
  if (ok) enterApp();
});
