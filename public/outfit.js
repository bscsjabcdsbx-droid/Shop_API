/* ==========================================================================
   NSHV — outfit.js: Phối đồ thông minh
   - Chỉ gọi backend Shop_API: POST /api/outfit/recommend. Mọi sản phẩm hiển thị đều lấy từ database thật.
   - Không tự tạo sản phẩm hay điểm số ở trình duyệt; giao diện chỉ hiển thị kết quả backend trả về.
   Phụ thuộc: app.js (A, P, $, esc, vnd, toast, user, go, modal, img) và api.js (window.MONO_TRYON).
   ========================================================================== */
(function () {
  const STYLES = [
    ['streetwear', 'Streetwear'], ['minimalist', 'Minimalist'], ['casual', 'Casual'], ['vintage', 'Vintage'],
    ['korean', 'Korean Style'], ['sporty', 'Sporty'], ['formal', 'Formal'], ['elegant', 'Elegant'],
    ['y2k', 'Y2K'], ['old_money', 'Old Money']
  ];
  const ROLE_LABEL = {
    top: 'Áo', bottom: 'Quần / Chân váy', dress: 'Váy', outer: 'Áo khoác',
    footwear: 'Giày', bag: 'Túi', accessory: 'Phụ kiện'
  };
  const SLOT_ORDER = ['top', 'outer', 'dress', 'bottom', 'footwear', 'bag'];
  const CONF_LABEL = { high: 'Độ tin cậy cao', medium: 'Độ tin cậy vừa', low: 'Độ tin cậy thấp' };
  const NOTE_TEXT = {
    NO_FOOTWEAR_IN_CATALOG: 'Cửa hàng hiện chưa có giày phù hợp để gợi ý.',
    INCOMPLETE_OUTFIT: 'Một số bộ chưa đầy đủ vì cửa hàng chưa có đủ sản phẩm phù hợp.',
    NOTHING_WITHIN_BUDGET_OR_LOW_CONFIDENCE: 'Không có bộ nào vừa ngân sách và đủ dữ liệu để đánh giá tin cậy.'
  };

  const O = { product: null, style: 'casual', budget: '', loading: false, data: null, error: '', seq: 0 };

  const env = () => window.MONO_TRYON || null;
  const live = () => !!(env() && env().online);
  const root = () => document.getElementById('outfit');
  const origin = () => (env() && env().api ? env().api.replace(/\/api$/, '') : '');

  function src(it) {
    const p = typeof P === 'function' ? P(it.id) : null;
    if (p) return img(p, 0);
    const u = it.image || '';
    return u.startsWith('/') ? origin() + u : u;
  }

  async function call(body) {
    const e = env();
    const h = { 'Content-Type': 'application/json' };
    const tok = e.token();
    if (tok) h.Authorization = 'Bearer ' + tok;
    const r = await fetch(e.api + '/outfit/recommend', { method: 'POST', headers: h, body: JSON.stringify(body) });
    let d = {};
    try { d = await r.json(); } catch (x) {}
    if (!r.ok) {
      const err = new Error(d.error || 'Không thể phối đồ lúc này');
      err.status = r.status;
      throw err;
    }
    return d;
  }

  /* ---------- hiển thị ---------- */
  function itemCard(it, label) {
    const known = typeof P === 'function' && P(it.id);
    return `<div class="of-it"><a class="of-ph" data-of="detail:${it.id}" role="link" tabindex="0"><img src="${esc(src(it))}" alt="${esc(it.name)}" loading="lazy"></a>
<div class="of-in"><span class="mut of-role">${esc(label || ROLE_LABEL[it.role] || '')}${it.color ? ' · ' + esc(it.color) : ''}</span>
<a class="of-nm" data-of="detail:${it.id}" role="link" tabindex="0">${esc(it.name)}</a>
<span class="of-pr"><b>${vnd(it.price)}</b>${it.originalPrice ? ` <s class="mut">${vnd(it.originalPrice)}</s>` : ''}</span>
<div class="row"><button class="btn o s" data-of="detail:${it.id}">Xem chi tiết</button>${known ? `<button class="btn s" data-of="add:${it.id}">Thêm vào giỏ</button>` : ''}</div></div></div>`;
  }

  function outfitCard(o, n) {
    const its = [];
    SLOT_ORDER.forEach(k => { if (o.items[k]) its.push(itemCard(o.items[k])); });
    (o.items.accessories || []).forEach(a => its.push(itemCard(a, 'Phụ kiện')));
    return `<section class="box of-card"><div class="of-hd"><div><b>Bộ ${n}</b>${o.complete ? '' : ' <span class="badge">Chưa đầy đủ</span>'}<br><span class="mut">${esc(CONF_LABEL[o.confidenceLevel] || '')}</span></div>
<div class="of-sc"><span class="of-score" title="Điểm tương thích">${o.matchScore}<small>/100</small></span><b>${vnd(o.totalPrice)}</b><span class="mut">gồm cả sản phẩm gốc</span></div></div>
<div class="of-items">${its.join('')}</div>${o.complete ? '' : '<p class="mut">Bộ này chưa có đủ món chính vì cửa hàng chưa có sản phẩm phù hợp.</p>'}</section>`;
  }

  function paint() {
    const el = root();
    if (!el || !O.product) return;
    const b = O.data && O.data.baseProduct;
    const chips = STYLES.map(s => `<button class="chip${O.style === s[0] ? ' on' : ''}" data-of="style:${s[0]}" aria-pressed="${O.style === s[0]}">${s[1]}</button>`).join('');
    let res = '';
    if (O.loading) res = '<div class="empty" role="status">Đang phối đồ…</div>';
    else if (O.error) res = `<div class="err" role="alert">${esc(O.error)}</div>`;
    else if (O.data) {
      const d = O.data;
      const notes = (d.meta.notes || []).map(k => NOTE_TEXT[k]).filter(Boolean);
      res = d.recommendations.length
        ? d.recommendations.map((o, i) => outfitCard(o, i + 1)).join('')
        : '<div class="empty">Chưa tìm được bộ trang phục phù hợp với phong cách và ngân sách này.</div>';
      if (notes.length) res += `<p class="mut">${notes.map(esc).join('<br>')}</p>`;
    }
    el.innerHTML = `<h3>Phối đồ với sản phẩm này</h3>
<div class="of-base row">${b ? `<img class="of-bi" src="${esc(src(b))}" alt="">` : ''}<div><b>${esc(O.product.name)}</b><br><span class="mut">Chọn phong cách rồi bấm “Bắt đầu phối đồ”.</span></div></div>
<div class="fld"><label>Phong cách</label><div class="of-chips">${chips}</div></div>
<div class="fld"><label for="of_b">Ngân sách tối đa cho cả bộ (₫, không bắt buộc)</label><input id="of_b" type="number" min="0" step="10000" inputmode="numeric" value="${esc(O.budget)}" placeholder="Ví dụ: 1000000"></div>
<div class="row"><button class="btn" data-of="go" ${O.loading ? 'disabled' : ''}>Bắt đầu phối đồ</button><button class="btn o" data-a="mclose">Đóng</button></div>
<div class="of-res">${res}</div>`;
  }

  async function run() {
    const b = root() && root().querySelector('#of_b');
    O.budget = b ? b.value.trim() : O.budget;
    const budget = O.budget ? Math.floor(Number(O.budget)) : undefined;
    if (O.budget && !(budget > 0)) { O.error = 'Ngân sách không hợp lệ'; O.data = null; return paint(); }
    const mine = ++O.seq;
    O.loading = true; O.error = ''; O.data = null;
    paint();
    try {
      const d = await call({ productId: O.product.id, style: O.style, ...(budget ? { budget } : {}) });
      if (mine !== O.seq) return;
      O.data = d;
    } catch (e) {
      if (mine !== O.seq) return;
      O.error = e.status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
        : e.status === 429 ? 'Bạn thao tác quá nhanh. Vui lòng chờ một chút rồi thử lại.'
        : e.status === 404 || e.status === 422 ? e.message
        : 'Không thể phối đồ lúc này. Vui lòng thử lại sau.';
    }
    O.loading = false;
    paint();
  }

  function open(p) {
    if (!p) return;
    if (!live()) return toast('Phối đồ cần kết nối tới máy chủ cửa hàng');
    if (!user()) {
      toast('Vui lòng đăng nhập để phối đồ');
      return go('auth', 'login');
    }
    if (!O.product || O.product.id !== p.id) { O.data = null; O.error = ''; }
    O.product = p;
    O.seq++;
    O.loading = false;
    modal('<div id="outfit" class="of"></div>');
    paint();
  }

  // Nút trong cửa sổ dùng data-of để không đụng bộ xử lý chung data-a của app.js.
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-of]');
    if (!t || !root() || !root().contains(t) || t.disabled) return;
    const [a, v] = t.dataset.of.split(':');
    if (a === 'style') { O.style = v; O.data = null; O.error = ''; O.seq++; O.loading = false; return paint(); }
    if (a === 'go') return run();
    if (a === 'detail') { modal(''); return go('detail', +v); }
    if (a === 'add') return A.quick(String(v));
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const t = e.target.closest && e.target.closest('a[data-of]');
    if (t && root() && root().contains(t)) t.click();
  });

  window.Outfit = { open };
  A.outfit = p => open(P(p));
})();
