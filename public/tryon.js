/* ==========================================================================
   NSHV — tryon.js: Thử đồ AI (CatVTON)
   - Chỉ gọi backend Shop_API (/api/try-on/...). Không biết URL máy AI hay bất kỳ khóa nào.
   - Mọi giới hạn được kiểm tra ở backend; giao diện chỉ hiển thị trạng thái thật do backend trả về.
   - Ảnh được xử lý trong trình duyệt (xem trước, thu nhỏ, bỏ EXIF/GPS) và chỉ gửi khi người dùng bấm xác nhận.
   Phụ thuộc: app.js (A, P, $, esc, toast, user, go, modal) và api.js (window.MONO_TRYON).
   ========================================================================== */
(function () {
  const POLL_MS = 2000;
  const MAX_SIDE = 2048; // cạnh dài tối đa khi gửi; CatVTON chỉ dùng 768x1024
  const T = {
    cfg: null, // cấu hình từ /api/try-on/config
    product: null,
    file: null, // Blob đã chuẩn hóa để gửi
    previewUrl: '',
    job: null,
    quota: null,
    resultUrl: '', // object URL của ảnh kết quả (chỉ trong bộ nhớ trang)
    resultJobId: '',
    busy: false,
    pollTimer: 0,
    countdown: 0,
    msg: '',
    msgKind: '',
    offline: false
  };

  const env = () => window.MONO_TRYON || null;
  const live = () => !!(env() && env().online);
  const root = () => document.getElementById('tryon');
  const fmtMB = b => (b / 1048576).toFixed(0) + ' MB';
  const key = () =>
    window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);

  async function call(path, opts = {}) {
    const e = env();
    const h = Object.assign({}, opts.headers || {});
    const tok = e.token();
    if (tok) h.Authorization = 'Bearer ' + tok;
    const r = await fetch(e.api + '/try-on' + path, { method: opts.method || 'GET', headers: h, body: opts.body });
    return r;
  }
  async function json(r) {
    try {
      return await r.json();
    } catch (e) {
      return {};
    }
  }

  /* ---------- cấu hình & sản phẩm hỗ trợ ---------- */
  async function loadCfg() {
    if (!live()) return null;
    try {
      const r = await call('/config');
      if (r.ok) {
        T.cfg = await r.json();
        // Cập nhật nút trên trang chi tiết khi đã biết sản phẩm nào được hỗ trợ.
        if (typeof S !== 'undefined' && S.view === 'detail' && !document.getElementById('tryon')) render();
      }
    } catch (e) {}
    return T.cfg;
  }
  // null = chưa biết (vẫn hiện nút, backend quyết định), true/false nếu đã có cấu hình
  function supports(p) {
    if (!p || !live()) return false;
    if (p.tryOnType === 'none') return false;
    if (p.tryOnType) return true;
    if (!T.cfg) return null;
    if (!T.cfg.enabled) return false;
    return !!T.cfg.categoryMap[p.cat];
  }

  /* ---------- kiểm tra & chuẩn hóa ảnh ở trình duyệt ---------- */
  async function sniff(file) {
    const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return 'image/png';
    const s = String.fromCharCode(...b);
    if (s.slice(0, 4) === 'RIFF' && s.slice(8, 12) === 'WEBP') return 'image/webp';
    return null;
  }
  function loadImg(url) {
    return new Promise((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error('decode'));
      i.src = url;
    });
  }
  async function prepare(file) {
    const max = (T.cfg && T.cfg.uploadMaxSize) || 10485760;
    if (file.size > max) throw new Error(`Ảnh vượt quá ${fmtMB(max)}. Hãy chọn ảnh nhỏ hơn.`);
    if (!(await sniff(file))) throw new Error('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.');
    const url = URL.createObjectURL(file);
    let img;
    try {
      img = await loadImg(url);
    } catch (e) {
      URL.revokeObjectURL(url);
      throw new Error('Không đọc được ảnh. File có thể bị hỏng.');
    }
    URL.revokeObjectURL(url);
    const w = img.naturalWidth,
      h = img.naturalHeight;
    if (w < 256 || h < 256) throw new Error('Ảnh quá nhỏ. Hãy dùng ảnh toàn thân rõ nét (tối thiểu 256 px).');
    // Vẽ lại qua canvas: thu nhỏ ảnh lớn và loại bỏ metadata (EXIF, vị trí GPS) trước khi gửi.
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.92));
    if (!blob) throw new Error('Không xử lý được ảnh trên trình duyệt này.');
    if (blob.size > max) throw new Error(`Ảnh vượt quá ${fmtMB(max)}.`);
    return blob;
  }

  /* ---------- giao diện ---------- */
  const STATUS = {
    sending: 'Đang tải ảnh lên…',
    queued: 'Đang chờ đến lượt',
    processing: 'AI đang xử lý ảnh…',
    completed: 'Đã tạo ảnh thành công',
    loadingResult: 'Đang tải ảnh kết quả…'
  };

  function quotaLine() {
    const q = T.quota;
    if (!q) return '';
    const w = Math.max(0, q.windowMax - q.windowUsed),
      d = Math.max(0, q.dailyMax - q.dailyUsed);
    return `<p class="mut tosm">Còn ${w}/${q.windowMax} lượt trong ${q.windowMinutes} phút · ${d}/${q.dailyMax} lượt trong 24 giờ</p>`;
  }
  function msgHtml() {
    if (!T.msg) return '';
    const cd = T.countdown > 0 ? ` <span class="mut">(thử lại sau ${fmtWait(T.countdown)})</span>` : '';
    return `<div class="to-msg ${T.msgKind}" role="${T.msgKind === 'bad' ? 'alert' : 'status'}">${esc(T.msg)}${cd}</div>`;
  }
  function fmtWait(s) {
    if (s >= 3600) return Math.ceil(s / 3600) + ' giờ';
    const m = Math.floor(s / 60),
      r = s % 60;
    return m ? `${m} phút ${String(r).padStart(2, '0')} giây` : `${r} giây`;
  }

  function view() {
    const p = T.product;
    const j = T.job;
    const head = `<div class="to-h"><h3>Thử đồ với AI</h3><button class="ib" data-a="mclose" aria-label="Đóng">✕</button></div>
      <p class="mut tosm">${esc(p.name)}</p>`;
    // 1) Có kết quả
    if (T.resultUrl && (!j || j.id === T.resultJobId)) {
      return `${head}<div class="to-res"><img src="${T.resultUrl}" alt="Ảnh AI mô phỏng bạn mặc ${esc(p.name)}"></div>
        <p class="mut tosm">Ảnh do AI tạo, chỉ mang tính minh họa; màu sắc và độ vừa thực tế có thể khác.</p>
        ${msgHtml()}${quotaLine()}
        <div class="row"><a class="btn" href="${T.resultUrl}" download="thu-do-${esc(p.slug || p.id)}.png">Tải ảnh về</a>
        <button class="btn o" data-to="again"${canTry() ? '' : ' disabled'}>Thử ảnh khác</button>
        <button class="btn o" data-a="mclose">Đóng</button></div>`;
    }
    // 2) Đang chạy
    if (T.busy || (j && (j.status === 'queued' || j.status === 'processing'))) {
      const st = T.busy && !j ? 'sending' : T.busy === 'result' ? 'loadingResult' : j.status;
      const other = j && j.productId !== p.id ? '<p class="mut tosm">Lượt này đang thử một sản phẩm khác bạn đã chọn trước đó.</p>' : '';
      const pos = j && j.status === 'queued' && j.queuePosition ? ` — vị trí thứ ${j.queuePosition} trong hàng đợi` : '';
      return `${head}<div class="to-wait" aria-live="polite"><span class="to-spin" aria-hidden="true"></span>
        <b>${STATUS[st]}${pos}</b>
        ${T.offline ? '<p class="mut tosm">Tạm mất kết nối tới máy chủ AI, đang thử kết nối lại…</p>' : ''}${other}
        <p class="mut tosm">Bạn có thể đóng cửa sổ này; mở lại "Thử đồ với AI" để xem tiếp.</p></div>
        ${msgHtml()}
        <div class="row">${j && j.status === 'queued' ? '<button class="btn o" data-to="cancel">Hủy lượt chờ</button>' : ''}
        <button class="btn o" data-a="mclose">Đóng</button></div>`;
    }
    // 3) Chọn ảnh
    const max = (T.cfg && T.cfg.uploadMaxSize) || 10485760;
    return `${head}
      <p class="tosm">Tải lên một ảnh <b>toàn thân</b>, đứng thẳng, nhìn rõ người, nền đơn giản.</p>
      <label class="to-drop${T.previewUrl ? ' has' : ''}">
        ${T.previewUrl ? `<img src="${T.previewUrl}" alt="Ảnh bạn đã chọn">` : `<span>Chọn ảnh từ thiết bị<br><span class="mut tosm">JPEG, PNG hoặc WebP · tối đa ${fmtMB(max)}</span></span>`}
        <input type="file" id="to_f" accept="image/jpeg,image/png,image/webp" hidden>
      </label>
      ${T.previewUrl ? '<div class="row" style="margin:8px 0"><button class="btn o s" data-to="pick">Đổi ảnh</button><button class="btn o s" data-to="clear">Xóa ảnh</button></div>' : ''}
      ${msgHtml()}${quotaLine()}
      <p class="mut tosm">Ảnh của bạn chỉ dùng để tạo ảnh thử đồ, không lưu vào cơ sở dữ liệu, không dùng để huấn luyện AI và được xóa khỏi máy chủ AI sau khi xử lý (ảnh kết quả được giữ tạm tối đa ${Math.round(((T.cfg && T.cfg.resultTtl) || 3600) / 60)} phút).</p>
      <div class="row"><button class="btn" data-to="start"${T.file && canTry() ? '' : ' disabled'}>Bắt đầu thử đồ</button>
      <button class="btn o" data-a="mclose">Hủy</button></div>`;
  }

  function canTry() {
    if (T.countdown > 0) return false;
    const q = T.quota;
    if (!q) return true;
    return q.windowUsed < q.windowMax && q.dailyUsed < q.dailyMax && q.activeJobs < q.maxActiveJobs;
  }

  function paint() {
    const el = root();
    if (!el) return;
    el.innerHTML = view();
    const f = el.querySelector('#to_f');
    if (f) f.addEventListener('change', () => onFile(f));
  }
  function setMsg(m, kind = 'bad') {
    T.msg = m || '';
    T.msgKind = kind;
  }

  /* ---------- hành động ---------- */
  async function onFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    setMsg('');
    try {
      const blob = await prepare(file);
      if (T.previewUrl) URL.revokeObjectURL(T.previewUrl);
      T.file = blob;
      T.previewUrl = URL.createObjectURL(blob);
    } catch (e) {
      setMsg(e.message);
    }
    paint();
  }
  function clearFile() {
    if (T.previewUrl) URL.revokeObjectURL(T.previewUrl);
    T.file = null;
    T.previewUrl = '';
  }

  function startCountdown(sec) {
    T.countdown = Math.max(0, Math.ceil(sec));
    clearInterval(T.cdTimer);
    if (!T.countdown) return;
    T.cdTimer = setInterval(() => {
      T.countdown--;
      if (T.countdown <= 0) {
        clearInterval(T.cdTimer);
        T.countdown = 0;
        setMsg('');
        refreshQuota();
      }
      if (root()) paint();
      else clearInterval(T.cdTimer);
    }, 1000);
  }

  async function start() {
    if (T.busy || !T.file) return; // chống double-click
    T.busy = true;
    setMsg('');
    paint();
    const k = key(); // giữ nguyên khi gửi lại do lỗi mạng -> backend không tạo job trùng
    const body = () => {
      const f = new FormData();
      f.append('productId', String(T.product.id));
      f.append('personImage', T.file, 'anh.jpg');
      return f;
    };
    let r = null;
    for (let attempt = 0; attempt < 2 && !r; attempt++) {
      try {
        r = await call('', { method: 'POST', headers: { 'Idempotency-Key': k }, body: body() });
      } catch (e) {
        if (attempt === 0) await new Promise(ok => setTimeout(ok, 1500));
      }
    }
    T.busy = false;
    if (!r) {
      setMsg('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
      return paint();
    }
    const d = await json(r);
    if (r.status === 401) return expired();
    if (r.ok && d.job) {
      T.job = d.job;
      clearFile();
      paint();
      return poll();
    }
    if (r.status === 429 && d.code === 'ACTIVE_JOB_EXISTS') {
      setMsg(d.error, 'warn');
      return restore();
    }
    const ra = Number(r.headers.get('Retry-After')) || d.retryAfter || 0;
    setMsg(d.error || 'Đã xảy ra lỗi. Vui lòng thử lại.', r.status === 429 ? 'warn' : 'bad');
    if (r.status === 429 && ra) startCountdown(ra);
    await refreshQuota();
    paint();
  }

  function expired() {
    modal('');
    toast('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
    go('auth', 'login');
  }

  async function refreshQuota() {
    try {
      const r = await call('/active');
      if (r.ok) T.quota = (await r.json()).quota;
    } catch (e) {}
  }

  function poll() {
    clearTimeout(T.pollTimer);
    if (!root() || !T.job) return;
    T.pollTimer = setTimeout(async () => {
      if (!root() || !T.job) return;
      try {
        const r = await call('/' + T.job.id + '/status');
        if (r.status === 401) return expired();
        if (r.ok) {
          const j = (await r.json()).job;
          T.offline = j.serviceReachable === false;
          T.job = j;
        } else T.offline = true;
      } catch (e) {
        T.offline = true;
      }
      return afterStatus();
    }, POLL_MS);
  }

  async function afterStatus() {
    const j = T.job;
    if (!j) return paint();
    if (j.status === 'queued' || j.status === 'processing') {
      paint();
      return poll();
    }
    if (j.status === 'completed') {
      if (j.resultAvailable) return fetchResult();
      setMsg(j.message || 'Ảnh kết quả đã hết hạn lưu tạm. Vui lòng tạo lại.');
    } else if (j.status === 'failed') {
      setMsg(j.message || 'Tác vụ đã thất bại.');
    } else if (j.status === 'cancelled') {
      setMsg('Đã hủy lượt thử đồ.', 'warn');
    }
    T.job = null;
    await refreshQuota();
    paint();
  }

  async function fetchResult() {
    const j = T.job;
    T.busy = 'result';
    paint();
    try {
      const r = await call('/' + j.id + '/result');
      if (r.status === 401) return expired();
      const ct = r.headers.get('Content-Type') || '';
      if (r.ok && ct.startsWith('image/')) {
        const blob = await r.blob();
        if (T.resultUrl) URL.revokeObjectURL(T.resultUrl);
        T.resultUrl = URL.createObjectURL(blob);
        T.resultJobId = j.id;
        T.resultProductId = j.productId;
        setMsg('Đã tạo ảnh thành công.', 'ok');
      } else {
        const d = await json(r);
        setMsg(d.error || 'Không tải được ảnh kết quả.');
        T.job = null;
      }
    } catch (e) {
      setMsg('Không tải được ảnh kết quả. Kiểm tra mạng rồi mở lại để thử tiếp.');
    }
    T.busy = false;
    await refreshQuota();
    paint();
  }

  async function cancel() {
    if (!T.job) return;
    try {
      const r = await call('/' + T.job.id, { method: 'DELETE' });
      const d = await json(r);
      if (d.job) T.job = d.job;
    } catch (e) {}
    afterStatus();
  }

  // Giải phóng ảnh kết quả trên máy AI khi người dùng đã xem xong (ảnh vẫn còn trong trang để tải về).
  function release(jobId) {
    if (!jobId || !live()) return;
    call('/' + jobId, { method: 'DELETE' }).catch(() => {});
  }

  async function restore() {
    try {
      const r = await call('/active');
      if (r.status === 401) return expired();
      if (r.ok) {
        const d = await r.json();
        T.quota = d.quota;
        if (d.quota && d.quota.retryAfter && !(d.job && (d.job.status === 'queued' || d.job.status === 'processing')))
          startCountdown(d.quota.retryAfter);
        const j = d.job;
        if (j && (j.status === 'queued' || j.status === 'processing')) {
          T.job = j;
          paint();
          return poll();
        }
        if (j && j.status === 'completed' && j.resultAvailable && j.id !== T.resultJobId && j.productId === T.product.id) {
          T.job = j;
          return fetchResult();
        }
      }
    } catch (e) {}
    paint();
  }

  async function open(p) {
    if (!p) return;
    if (!live()) return toast('Thử đồ AI cần kết nối tới máy chủ cửa hàng');
    if (!user()) {
      toast('Vui lòng đăng nhập để thử đồ với AI');
      return go('auth', 'login');
    }
    if (!T.cfg) await loadCfg();
    if (T.cfg && !T.cfg.enabled) return toast('Tính năng thử đồ AI hiện chưa được bật');
    if (supports(p) === false) return toast('Sản phẩm này chưa hỗ trợ thử đồ AI');
    if (!T.product || T.product.id !== p.id) {
      // Kết quả cũ thuộc sản phẩm khác: không hiển thị nhầm.
      if (T.resultUrl && T.resultProductId !== p.id) {
        URL.revokeObjectURL(T.resultUrl);
        T.resultUrl = '';
        T.resultJobId = '';
      }
    }
    T.product = p;
    T.offline = false;
    setMsg('');
    if (T.cfg && !T.cfg.online) setMsg('Máy chủ AI hiện không hoạt động. Bạn vẫn có thể chọn ảnh, nhưng lượt thử có thể bị từ chối.', 'warn');
    modal('<div id="tryon" class="to"></div>');
    paint();
    restore();
  }

  // Nút trong cửa sổ (không dùng data-a để không đụng bộ xử lý chung của app.js)
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-to]');
    if (!t || !root() || !root().contains(t) || t.disabled) return;
    const a = t.dataset.to;
    if (a === 'pick') return root().querySelector('#to_f').click();
    if (a === 'clear') {
      clearFile();
      return paint();
    }
    if (a === 'start') return start();
    if (a === 'cancel') return cancel();
    if (a === 'again') {
      const old = T.resultJobId;
      if (T.resultUrl) URL.revokeObjectURL(T.resultUrl);
      T.resultUrl = '';
      T.resultJobId = '';
      T.job = null;
      setMsg('');
      release(old);
      return paint();
    }
  });

  // Khi cửa sổ bị đóng (nút Đóng, bấm nền, phím Esc): dừng polling, giải phóng ảnh đã xem trên máy AI.
  new MutationObserver(() => {
    if (root() || !T.product) return;
    clearTimeout(T.pollTimer);
    if (T.resultJobId && T.released !== T.resultJobId) {
      release(T.resultJobId);
      T.released = T.resultJobId;
    }
  }).observe(document.getElementById('modal'), { childList: true });

  window.TryOn = { open, supports, loadCfg };
  A.tryon = p => open(P(p));
})();
