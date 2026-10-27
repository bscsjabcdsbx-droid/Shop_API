/* ==========================================================================
   MONO — api.js (nối giao diện với shop-api)
   Nếu không gọi được API, trang tự chạy chế độ demo (localStorage).
   Mục lục:
   1. Cấu hình & token
   2. Gọi API
   3. Chuyển đổi dữ liệu server sang dữ liệu giao diện
   4. Nạp dữ liệu từ server
   5. Ghi đè hành vi: lõi, giỏ hàng, tài khoản, đơn hàng, sản phẩm admin,
      đơn hàng admin, bộ sưu tập, đánh giá, tổng quan
   6. Khởi động
   ========================================================================== */
(function () {
  /* ==========================================================================
   1. CẤU HÌNH & TOKEN
   ========================================================================== */
  const API_HOST = 'shop-api-1-gvf9.onrender.com';
  const API =
    window.MONO_API ||
    (location.port === '4000' || location.hostname === API_HOST ? '/api' : 'https://' + API_HOST + '/api');
  const ORIGIN = API.replace(/\/api$/, '');
  const ENUM = ['PENDING', 'CONFIRMED', 'PREPARING', 'SHIPPING', 'DELIVERED', 'CANCELLED'];
  const SZ = ['S', 'M', 'L', 'XL', 'FREE'];
  const CATIDS = {};
  let TOKEN = '';
  let SERVER_COLS = false;
  let ADMIN_P = false;
  let VM = {};
  try {
    TOKEN = localStorage.getItem('mono-token') || '';
  } catch (e) {}
  const setTok = t => {
    TOKEN = t;
    try {
      t ? localStorage.setItem('mono-token', t) : localStorage.removeItem('mono-token');
    } catch (e) {}
  };
  const isAdmin = () => {
    const u = user();
    return !!u && u.role === 'admin';
  };
  const abs = u => (u && u.startsWith('/') ? ORIGIN + u : u);
  const rel = u => (u && u.startsWith('images/') ? '/' + u : ORIGIN && u && u.startsWith(ORIGIN + '/') ? u.slice(ORIGIN.length) : u);

  /* ==========================================================================
   2. GỌI API
   ========================================================================== */
  async function rq(path, o = {}) {
    const h = { 'Content-Type': 'application/json' };
    if (TOKEN) h.Authorization = 'Bearer ' + TOKEN;
    const r = await fetch(API + path, {
      method: o.method || 'GET',
      headers: h,
      body: o.body ? JSON.stringify(o.body) : undefined
    });
    let d = null;
    try {
      d = await r.json();
    } catch (e) {}
    if (!r.ok) {
      const x = d && d.details && d.details[0];
      const e = new Error(
        x ? `Dữ liệu không hợp lệ (${(x.path || []).join('.')}): ${x.message}` : (d && d.error) || 'Lỗi ' + r.status
      );
      e.status = r.status;
      throw e;
    }
    return d;
  }

  /* ==========================================================================
   3. CHUYỂN ĐỔI DỮ LIỆU SERVER -> GIAO DIỆN
   ========================================================================== */
  const mapP = s => {
    const vs = s.variants || [],
      stock = {},
      vid = {};
    vs.forEach(v => {
      stock[v.size + '|' + v.color] = v.stock;
      vid[v.size + '|' + v.color] = v.id;
    });
    const sizes = [...new Set(vs.map(v => v.size))].sort((a, b) => SZ.indexOf(a) - SZ.indexOf(b));
    const colors = Object.keys(COLS).filter(c => vs.some(v => v.color === c));
    return {
      id: s.id,
      slug: s.slug,
      name: s.name,
      cat: s.category.slug,
      price: s.price,
      sale: s.salePrice || 0,
      sold: s.soldCount,
      mat: s.material || '',
      desc: s.description,
      sizes,
      colors,
      stock,
      vid,
      date: Date.parse(s.createdAt),
      rating: s.rating || 0,
      images: (s.images || []).map(i => abs(i.url)),
      active: s.isActive !== false
    };
  };
  const mapO = o => ({
    id: o.code,
    rid: o.id,
    uid: o.userId,
    date: Date.parse(o.createdAt),
    status: ENUM.indexOf(o.status),
    name: o.shipName,
    phone: o.shipPhone,
    email: o.shipEmail,
    addr: o.shipAddress,
    note: o.note || '',
    pay: o.paymentMethod,
    ship: o.shippingFee,
    sub: o.subtotal,
    total: o.total,
    items: o.items.map(i => ({
      pid: VM[i.variantId] || 0,
      name: i.name,
      size: i.size,
      color: i.color,
      price: i.price,
      qty: i.quantity
    }))
  });
  const mapCol = c => ({
    id: c.id,
    title: c.title,
    cat: c.categorySlug,
    image: abs(c.imageUrl || ''),
    active: c.isActive,
    pos: c.position
  });
  const mapReview = r => ({ u: r.user.name, uid: r.userId, r: r.rating, c: r.comment, d: Date.parse(r.createdAt) });

  /* ==========================================================================
   4. NẠP DỮ LIỆU TỪ SERVER
   ========================================================================== */
  async function loadProducts() {
    const d = await rq('/products?limit=48');
    db.products = d.items.map(mapP);
    VM = {};
    db.products.forEach(p =>
      Object.values(p.vid).forEach(v => {
        VM[v] = p.id;
      })
    );
    d.items.forEach(p => {
      db.reviews[p.id] = Array.from({ length: p.reviewCount }, () => ({ r: p.rating, u: '', c: '' }));
    });
  }
  async function loadCats() {
    (await rq('/products/categories')).forEach(c => {
      CATIDS[c.slug] = c.id;
    });
  }
  async function loadCols() {
    try {
      db.collections = (await rq('/collections')).map(mapCol);
      SERVER_COLS = true;
    } catch (e) {
      SERVER_COLS = false;
      try {
        db.collections = JSON.parse(localStorage.getItem('mono-collections')) || undefined;
      } catch (x) {}
    }
  }
  async function refreshCols() {
    db.collections = (await rq(isAdmin() ? '/admin/collections' : '/collections')).map(mapCol);
  }
  function setUser(u) {
    db.users = [
      {
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone || '',
        role: u.role === 'ADMIN' ? 'admin' : 'user',
        ok: true
      }
    ];
    db.session = u.id;
  }
  async function loadCart() {
    if (!db.session) return;
    const d = await rq('/cart');
    db.carts[db.session] = d.items
      .map(i => {
        const p = db.products.find(x => x.slug === i.slug);
        return p ? { pid: p.id, size: i.size, color: i.color, qty: i.quantity, cid: i.id } : null;
      })
      .filter(Boolean);
  }
  async function loadMyOrders() {
    db.orders = (await rq('/orders')).map(mapO);
  }
  async function loadDetail(a) {
    const p0 = P(a);
    if (!p0) return;
    try {
      const d = await rq('/products/' + p0.slug);
      db.reviews[d.id] = (d.reviews || []).map(mapReview);
      p0.rating = d.rating;
      d.variants.forEach(v => {
        p0.stock[v.size + '|' + v.color] = v.stock;
        p0.vid[v.size + '|' + v.color] = v.id;
      });
      if (S.view === 'detail') render();
    } catch (e) {}
  }
  async function loadAdmin() {
    try {
      if (S.adm === 'dash') {
        S.stats = await rq('/admin/stats');
        db.orders = (await rq('/admin/orders')).map(mapO);
      } else if (S.adm === 'aprod') {
        db.products = (await rq('/admin/products')).map(mapP);
        ADMIN_P = true;
      } else if (S.adm === 'aord') db.orders = (await rq('/admin/orders')).map(mapO);
      else if (S.adm === 'acol' && SERVER_COLS) db.collections = (await rq('/admin/collections')).map(mapCol);
      else if (S.adm === 'acus') {
        db.orders = (await rq('/admin/orders')).map(mapO);
        const cs = await rq('/admin/customers');
        db.users = [
          ...db.users.filter(u => u.id === db.session),
          ...cs.map(c => ({
            id: c.id,
            email: c.email,
            name: c.name,
            phone: c.phone || '',
            role: 'user',
            ok: c.isActive
          }))
        ];
      }
      if (S.view === 'admin') render();
    } catch (e) {
      toast(e.message);
    }
  }
  /* Tải lại danh sách sản phẩm: trong tab Sản phẩm của admin thì lấy cả sản phẩm đang ẩn */
  async function reloadProducts() {
    if (ADMIN_P && S.view === 'admin' && S.adm === 'aprod') {
      db.products = (await rq('/admin/products')).map(mapP);
    } else await loadProducts();
  }
  async function afterAuth(res) {
    setTok(res.token);
    setUser(res.user);
    const g = db.carts.guest || [];
    delete db.carts.guest;
    for (const i of g) {
      const v = (P(i.pid) || { vid: {} }).vid[i.size + '|' + i.color];
      if (v)
        try {
          await rq('/cart/items', { method: 'POST', body: { variantId: v, quantity: i.qty } });
        } catch (e) {}
    }
    await loadCart();
    const a = S.after;
    S.after = null;
    toast('Xin chào, ' + res.user.name);
    go(a || (res.user.role === 'ADMIN' ? 'admin' : 'home'));
  }

  /* ==========================================================================
   5. GHI ĐÈ HÀNH VI
   ========================================================================== */
  /* --- 5.1 Lõi: lưu cục bộ, điều hướng, tải ảnh --- */
  function patchCore() {
    save = () => {
      try {
        localStorage.setItem('mono-wish', JSON.stringify(db.wish));
        if (!SERVER_COLS) localStorage.setItem('mono-collections', JSON.stringify(db.collections || null));
      } catch (e) {}
    };
    rate = p => p.rating || 0;
    const go0 = go;
    go = function (v, a = null) {
      if (ADMIN_P && v !== 'admin') {
        ADMIN_P = false;
        db.products = db.products.filter(p => p.active !== false);
        loadProducts().then(() => render()).catch(() => {});
      }
      go0(v, a);
      if (v === 'detail') {
        loadDetail(a);
        if (db.session && !isAdmin())
          loadMyOrders()
            .then(() => {
              if (S.view === 'detail') render();
            })
            .catch(() => {});
      } else if (v === 'orders' && db.session)
        loadMyOrders()
          .then(() => {
            if (S.view === 'orders') render();
          })
          .catch(e => toast(e.message));
      else if (v === 'admin') loadAdmin();
    };
    storeImage = async d => {
      try {
        return ORIGIN + (await rq('/admin/upload', { method: 'POST', body: { dataUrl: d } })).url;
      } catch (e) {
        if ([404, 413, 500].includes(e.status))
          throw new Error('Máy chủ chưa hỗ trợ tải ảnh lên. Hãy dán đường dẫn ảnh hoặc cập nhật backend.');
        throw e;
      }
    };
  }

  /* --- 5.2 Giỏ hàng --- */
  function patchCart() {
    const addItem0 = addItem,
      cq0 = A.cq,
      cdel0 = A.cdel;
    addItem = async function (pid, size, color, qty) {
      if (!db.session) return addItem0(pid, size, color, qty);
      try {
        await rq('/cart/items', { method: 'POST', body: { variantId: P(pid).vid[size + '|' + color], quantity: qty } });
        await loadCart();
        render();
        toast('Đã thêm vào giỏ hàng');
        return true;
      } catch (e) {
        toast(e.message);
        return false;
      }
    };
    A.add = async p => {
      const pr = P(S.arg),
        s = S.sel,
        e = $('#serr');
      if (!s.size || !s.color) {
        e.textContent = 'Vui lòng chọn ' + (!s.color ? 'màu sắc' : 'size') + ' trước khi thêm vào giỏ.';
        return;
      }
      if ((await addItem(pr.id, s.size, s.color, s.qty || 1)) && p === '1') go('checkout');
    };
    A.cq = async p => {
      if (!db.session) return cq0(p);
      const [i, d] = p.split(':'),
        it = cart()[i],
        q = it.qty + +d;
      if (q < 1) return;
      try {
        await rq('/cart/items/' + it.cid, { method: 'PATCH', body: { quantity: q } });
        await loadCart();
        render();
      } catch (e) {
        toast(e.message);
      }
    };
    A.cdel = async p => {
      if (!db.session) return cdel0(p);
      const it = cart()[+p];
      try {
        await rq('/cart/items/' + it.cid, { method: 'DELETE' });
        await loadCart();
        render();
        toast('Đã xóa khỏi giỏ hàng');
      } catch (e) {
        toast(e.message);
      }
    };
    A.ship = () => {
      toast('Giao nhanh chưa hỗ trợ ở chế độ server, dùng giao tiêu chuẩn');
      render();
    };
  }

  /* --- 5.3 Tài khoản --- */
  function patchAccount() {
    A.login = async () => {
      try {
        await afterAuth(
          await rq('/auth/login', {
            method: 'POST',
            body: { email: $('#a_e').value.trim(), password: $('#a_p').value }
          })
        );
      } catch (e) {
        $('#aerr').textContent = e.message;
      }
    };
    A.reg = async () => {
      const n = $('#a_n').value.trim(),
        e = $('#a_e').value.trim().toLowerCase(),
        p = $('#a_p').value,
        er = $('#aerr');
      if (n.length < 2) return (er.textContent = 'Vui lòng nhập họ tên');
      if (!/^\S+@\S+\.\S+$/.test(e)) return (er.textContent = 'Email không hợp lệ');
      if (p.length < 8) return (er.textContent = 'Mật khẩu tối thiểu 8 ký tự');
      try {
        await afterAuth(await rq('/auth/register', { method: 'POST', body: { email: e, password: p, name: n } }));
      } catch (x) {
        er.textContent = x.message;
      }
    };
    A.logout = () => {
      setTok('');
      db.session = null;
      db.users = [];
      db.orders = [];
      toast('Đã đăng xuất');
      go('home');
    };
    A.psave = async () => {
      const n = $('#pf_n').value.trim(),
        p = $('#pf_p').value.trim();
      if (n.length < 2) return ($('#perr').textContent = 'Họ tên quá ngắn');
      if (p && !/^0\d{9}$/.test(p)) return ($('#perr').textContent = 'Số điện thoại không hợp lệ');
      try {
        const u = await rq('/auth/me', { method: 'PATCH', body: { name: n, phone: p || null } });
        Object.assign(user(), { name: u.name, phone: u.phone || '' });
        toast('Đã cập nhật thông tin');
        render();
      } catch (e) {
        $('#perr').textContent = e.message;
      }
    };
    A.pwsave = async () => {
      const n = $('#pw_n').value;
      if (n.length < 8) return ($('#werr').textContent = 'Mật khẩu mới tối thiểu 8 ký tự');
      try {
        await rq('/auth/change-password', { method: 'POST', body: { current: $('#pw_o').value, next: n } });
        toast('Đã đổi mật khẩu');
        render();
      } catch (e) {
        $('#werr').textContent = e.message;
      }
    };
  }

  /* --- 5.4 Đặt hàng & đơn hàng của khách --- */
  function patchOrders() {
    A.place = async () => {
      if (S.busy) return;
      keepCo();
      const c = S.co;
      let bad = false;
      [
        ['co_name', (c.co_name || '').trim().length >= 2, 'Nhập họ tên'],
        ['co_phone', /^0\d{9}$/.test(c.co_phone || ''), 'Số điện thoại gồm 10 số, bắt đầu bằng 0'],
        ['co_email', /^\S+@\S+\.\S+$/.test(c.co_email || ''), 'Email không hợp lệ'],
        ['co_addr', (c.co_addr || '').trim().length >= 3, 'Nhập địa chỉ'],
        ['co_prov', !!(c.co_prov || '').trim(), 'Nhập tỉnh/thành phố'],
        ['co_dist', !!(c.co_dist || '').trim(), 'Nhập quận/huyện'],
        ['co_ward', !!(c.co_ward || '').trim(), 'Nhập phường/xã']
      ].forEach(([id, ok, m]) => {
        const e = $('#e_' + id);
        if (e) e.textContent = ok ? '' : m;
        if (!ok) bad = true;
      });
      if (bad) return toast('Vui lòng kiểm tra lại thông tin giao hàng');
      S.busy = true;
      render();
      try {
        const o = await rq('/orders', {
          method: 'POST',
          body: {
            fullName: c.co_name.trim(),
            phone: c.co_phone,
            email: c.co_email,
            line: c.co_addr.trim(),
            province: c.co_prov.trim(),
            district: c.co_dist.trim(),
            ward: c.co_ward.trim(),
            note: c.co_note || undefined,
            paymentMethod: 'COD'
          }
        });
        S.busy = false;
        S.co = null;
        S.fast = false;
        await loadCart();
        await loadProducts();
        go('orders');
        toast('Đặt hàng thành công! Mã đơn: ' + o.code);
      } catch (e) {
        S.busy = false;
        render();
        toast(e.message);
      }
    };
    A.ocancel = async p => {
      if (!confirm('Hủy đơn ' + p + '?')) return;
      try {
        await rq('/orders/' + p + '/cancel', { method: 'POST' });
        await loadMyOrders();
        await loadProducts();
        render();
        toast('Đã hủy đơn');
      } catch (e) {
        toast(e.message);
      }
    };
  }

  /* --- 5.5 Admin: sản phẩm --- */
  function patchAdminProducts() {
    A.pdel = async p => {
      if (!confirm('Xóa sản phẩm này? Hành động không thể hoàn tác.')) return;
      try {
        const r = await rq('/admin/products/' + p, { method: 'DELETE' });
        await reloadProducts();
        render();
        toast(r.archived ? 'Sản phẩm đã có đơn hàng nên được ẩn thay vì xóa' : 'Đã xóa sản phẩm');
      } catch (e) {
        toast(e.message);
      }
    };
    A.psv = async p => {
      const g = i => $('#' + i).value.trim(),
        er = $('#merr'),
        price = +g('m_p'),
        sale = +g('m_s') || 0;
      const sizes = g('m_z')
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
      const colors = g('m_l')
        .split(',')
        .map(s => s.trim())
        .filter(c => COLS[c]);
      if (g('m_n').length < 2) return (er.textContent = 'Vui lòng nhập tên sản phẩm');
      if (!(price > 0)) return (er.textContent = 'Giá phải lớn hơn 0');
      if (sale && sale >= price) return (er.textContent = 'Giá khuyến mãi phải thấp hơn giá gốc');
      if (!sizes.length || !colors.length)
        return (er.textContent = 'Cần ít nhất 1 size và 1 màu hợp lệ (Đen, Trắng, Xám)');
      const old = +p ? P(p) : null,
        sl = slug(g('m_n'));
      const variants = sizes.flatMap(s =>
        colors.map(c => ({
          size: s,
          color: c,
          stock: old && old.stock[s + '|' + c] != null ? old.stock[s + '|' + c] : Math.max(0, +g('m_k') || 0)
        }))
      );
      const body = {
        name: g('m_n'),
        slug: sl,
        description: g('m_d') || g('m_n'),
        material: old ? old.mat : 'Cotton 100%',
        price,
        salePrice: sale || null,
        categoryId: CATIDS[g('m_c')],
        isActive: true,
        images: (S.pimgs || []).map(rel),
        variants
      };
      try {
        await rq(old ? '/admin/products/' + old.id : '/admin/products', { method: old ? 'PUT' : 'POST', body });
        modal('');
        await reloadProducts();
        render();
        toast('Đã lưu sản phẩm');
      } catch (e) {
        er.textContent = e.message;
      }
    };
  }

  /* --- 5.6 Admin: đơn hàng, hoàn thành đơn, khách hàng --- */
  function patchAdminOrders() {
    setStatus = async function (o, s) {
      try {
        await rq('/admin/orders/' + o.rid + '/status', { method: 'PATCH', body: { status: ENUM[s] } });
        o.status = s;
        await loadProducts();
        return true;
      } catch (e) {
        toast(e.message);
        render();
        return false;
      }
    };
    /* Hoàn thành: đi lần lượt qua các trạng thái hợp lệ cho đến "Đã giao" (chỉ dùng API có sẵn) */
    A.complete = async p => {
      const o = db.orders.find(x => x.id === p);
      if (!o || o.status >= 4) return;
      if (!confirm('Đánh dấu đơn ' + p + ' đã hoàn thành? Doanh thu sẽ được cập nhật.')) return;
      try {
        for (let s = o.status + 1; s <= 4; s++) {
          await rq('/admin/orders/' + o.rid + '/status', { method: 'PATCH', body: { status: ENUM[s] } });
          o.status = s;
        }
        o.doneAt = Date.now();
        render();
        toast('Đã hoàn thành đơn ' + p + ', doanh thu +' + vnd(o.total));
      } catch (e) {
        render();
        toast(e.message);
      }
    };
    A.lock = async p => {
      const u = db.users.find(x => x.id == p);
      try {
        await rq('/admin/customers/' + p + '/active', { method: 'PATCH', body: { isActive: !u.ok } });
        u.ok = !u.ok;
        render();
        toast(u.ok ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản');
      } catch (e) {
        toast(e.message);
      }
    };
    A.atab = p => {
      S.adm = p;
      S.aq = '';
      S.as = '';
      S.open = null;
      render();
      loadAdmin();
    };
  }

  /* --- 5.7 Admin: bộ sưu tập (dùng server nếu có, không thì lưu cục bộ) --- */
  function patchCollections() {
    const colSave0 = colSave,
      colRemove0 = colRemove,
      colMove0 = colMove,
      acol0 = acol;
    activeCols = function () {
      const l = getCols();
      if (SERVER_COLS && !l.length)
        return CONFIG.slides.map((s, i) => ({
          id: -i - 1,
          title: s.title,
          cat: s.cat,
          image: s.image || '',
          active: true
        }));
      return l.filter(c => c.active);
    };
    colSave = async (id, d) => {
      if (!SERVER_COLS) return colSave0(id, d);
      const l = getCols(),
        cur = id ? l.find(c => c.id == id) : null;
      const pos = cur && cur.pos != null ? cur.pos : Math.max(0, ...l.map(c => c.pos || 0)) + 1;
      const body = { title: d.title, categorySlug: d.cat, imageUrl: d.image ? rel(d.image) : null, isActive: d.active, position: pos };
      await rq(id ? '/admin/collections/' + id : '/admin/collections', { method: id ? 'PUT' : 'POST', body });
      await refreshCols();
    };
    colRemove = async id => {
      if (!SERVER_COLS) return colRemove0(id);
      await rq('/admin/collections/' + id, { method: 'DELETE' });
      await refreshCols();
    };
    colMove = async (id, dir) => {
      if (!SERVER_COLS) return colMove0(id, dir);
      try {
        await rq('/admin/collections/' + id + '/move', { method: 'POST', body: { direction: dir } });
      } catch (e) {
        if (e.status !== 404) throw e;
        /* Máy chủ chưa có endpoint /move: đổi thứ tự bằng cách ghi lại số position */
        const l = getCols().slice(),
          i = l.findIndex(c => c.id == id),
          k = i + dir;
        if (i < 0 || k < 0 || k >= l.length) return;
        [l[i], l[k]] = [l[k], l[i]];
        for (let n = 0; n < l.length; n++) {
          if (l[n].pos === n + 1) continue;
          const c = l[n];
          await rq('/admin/collections/' + c.id, {
            method: 'PUT',
            body: { title: c.title, categorySlug: c.cat, imageUrl: c.image ? rel(c.image) : null, isActive: c.active, position: n + 1 }
          });
        }
      }
      await refreshCols();
    };
    acol = function () {
      const note = SERVER_COLS
        ? ''
        : '<p class="err" style="min-height:0;margin:0 0 10px">Máy chủ chưa hỗ trợ bộ sưu tập: thay đổi chỉ lưu trên trình duyệt này. Cập nhật backend để mọi người cùng thấy.</p>';
      return note + acol0();
    };
  }

  /* --- 5.8 Đánh giá sản phẩm --- */
  function patchReviews() {
    reviewSave = async (pid, r, c) => {
      try {
        await rq('/products/' + pid + '/reviews', { method: 'POST', body: { rating: r, comment: c } });
      } catch (e) {
        if (e.status === 404)
          throw new Error('Máy chủ chưa hỗ trợ gửi đánh giá. Hãy cập nhật backend (xem HUONG-DAN.md).');
        throw e;
      }
      await loadDetail(S.arg);
    };
  }

  /* --- 5.9 Tổng quan: doanh thu chỉ tính đơn đã hoàn thành (tính từ danh sách đơn) --- */
  function patchDashboard() {
    dash = function () {
      const s = S.stats;
      if (!s) return '<div class="empty">Đang tải…</div>';
      const done = db.orders.filter(o => o.status === 4),
        rev = done.reduce((a, o) => a + o.total, 0),
        m = {};
      done.forEach(o => {
        const k = new Date(o.doneAt || o.date).toISOString().slice(0, 7);
        m[k] = (m[k] || 0) + o.total;
      });
      const ks = Object.keys(m).sort().slice(-6),
        mx = Math.max(1, ...ks.map(k => m[k]));
      return `<div class="stats">${[
        ['Doanh thu', vnd(rev)],
        ['Đơn hàng', s.orders],
        ['Khách hàng', s.customers],
        ['Sản phẩm', s.products]
      ]
        .map(x => `<div class="box"><span class="mut">${x[0]}</span><b>${x[1]}</b></div>`)
        .join('')}</div>
 <div class="two" style="margin-top:20px"><div class="box"><h3>Doanh thu theo tháng</h3>${ks.length ? `<div class="bars">${ks.map(k => `<div><i style="height:${Math.round((m[k] / mx) * 110)}px"></i>${k.slice(5)}/${k.slice(2, 4)}</div>`).join('')}</div>` : '<p class="mut">Chưa có đơn hoàn thành.</p>'}</div><div class="box"><h3>Sản phẩm bán chạy</h3>${s.topProducts.map(p => `<p class="row" style="justify-content:space-between;margin:6px 0"><span>${esc(p.name)}</span><b>${p.soldCount}</b></p>`).join('')}</div></div>
 <div class="box tw" style="margin-top:20px"><h3>Đơn hàng mới</h3><table><tr><th>Mã</th><th>Khách</th><th>Tổng</th><th>Trạng thái</th></tr>${s.recentOrders.map(o => `<tr><td>${o.code}</td><td>${esc(o.shipName)}</td><td>${vnd(o.total)}</td><td>${stB(ENUM.indexOf(o.status))}</td></tr>`).join('')}</table></div>`;
    };
  }

  function install() {
    patchCore();
    patchCart();
    patchAccount();
    patchOrders();
    patchAdminProducts();
    patchAdminOrders();
    patchCollections();
    patchReviews();
    patchDashboard();
  }

  /* ==========================================================================
   6. KHỞI ĐỘNG
   ========================================================================== */
  window.MONO_BOOT = async () => {
    try {
      const r = await fetch(API + '/health');
      if (!r.ok) throw 0;
    } catch (e) {
      setTimeout(() => toast('Không kết nối được API — đang chạy chế độ demo'), 700);
      return init();
    }
    let wish = {};
    try {
      wish = JSON.parse(localStorage.getItem('mono-wish')) || {};
    } catch (e) {}
    db = { v: 1, session: null, users: [], products: [], orders: [], carts: {}, wish, reviews: {} };
    install();
    await Promise.all([loadProducts(), loadCats(), loadCols()]);
    if (TOKEN) {
      try {
        setUser(await rq('/auth/me'));
        await loadCart();
      } catch (e) {
        setTok('');
        db.session = null;
        db.users = [];
      }
    }
  };
})();