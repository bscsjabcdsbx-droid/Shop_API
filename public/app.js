/* ==========================================================================
   MONO — app.js (logic giao diện)
   Mục lục:
   1. CẤU HÌNH (ảnh, slide, ảnh danh mục trang chủ)
   2. TIỆN ÍCH CHUNG
   3. DỮ LIỆU CỐ ĐỊNH (danh mục, màu, trạng thái đơn, dữ liệu mẫu)
   4. KHO DỮ LIỆU & TRẠNG THÁI (db, S, hàm đọc dữ liệu, khởi tạo)
   5. HÌNH ẢNH (ảnh sản phẩm, ảnh minh họa, xử lý tệp tải lên)
   6. THÀNH PHẦN DÙNG CHUNG (thẻ sản phẩm, ô mật khẩu, huy hiệu, cửa sổ)
   7. TRANG CHỦ & BĂNG CHUYỀN BỘ SƯU TẬP
   8. TRANG SẢN PHẨM (danh sách, bộ lọc, chi tiết)
   9. GIỎ HÀNG & THANH TOÁN
   10. TÀI KHOẢN & ĐƠN HÀNG CỦA KHÁCH
   11. TRANG QUẢN TRỊ (admin: tổng quan, sản phẩm, đơn hàng, khách hàng, ảnh)
   12. TÌM KIẾM, GỢI Ý & HEADER
   13. ĐIỀU HƯỚNG & VẼ TRANG
   14. XỬ LÝ SỰ KIỆN (nút bấm, form, bàn phím)
   15. KHỞI ĐỘNG
   ========================================================================== */

/* ==========================================================================
  1. CẤU HÌNH (ảnh, slide, ảnh danh mục trang chủ)
   ========================================================================== */

const CONFIG = {
  /* Thư mục chứa ảnh sản phẩm theo quy ước tên-slug-số.jpg (vd images/ao-thun-basic-0.jpg). Để '' để tắt. */
  imageDir: '',
  /* Slide trang chủ: image là đường dẫn ảnh (vd 'images/thu-dong.jpg'); để '' thì dùng ảnh sản phẩm đầu tiên của danh mục. */
  slides: [
    { cat: 'khoac', title: 'Thu đông 2026', image: '' },
    { cat: 'ao', title: 'Basic hằng ngày', image: '' },
    { cat: 'quan', title: 'Denim & Kaki', image: '' },
    { cat: 'vay', title: 'Váy mùa mới', image: '' },
    { cat: 'pk', title: 'Phụ kiện điểm nhấn', image: '' }
  ],
  /* Ảnh thẻ danh mục ở trang chủ; để '' dùng ảnh minh họa. */
  categoryImages: { ao: '', quan: '', vay: '', khoac: '', pk: '' }
};

/* ==========================================================================
  2. TIỆN ÍCH CHUNG
   ========================================================================== */

const $ = s => document.querySelector(s),
  LS = 'mono-shop-v1';

const esc = s =>
  String(s).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const vnd = n => n.toLocaleString('vi-VN') + '₫';

const slug = s =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const norm = s =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mono:' + s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function toast(t) {
  const e = $('#toast');
  e.textContent = t;
  e.style.display = 'block';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (e.style.display = 'none'), 2600);
}

/* ==========================================================================
  3. DỮ LIỆU CỐ ĐỊNH (danh mục, màu, trạng thái đơn, dữ liệu mẫu)
   ========================================================================== */

const CATS = [
  ['ao', 'Áo', '#d9d4cc'],
  ['quan', 'Quần', '#c9ced6'],
  ['vay', 'Váy', '#e3d2d2'],
  ['khoac', 'Áo khoác', '#bfc7bd'],
  ['pk', 'Phụ kiện', '#d6cfbf']
];

const COLS = { Đen: '#111', Trắng: '#f4f4f4', Xám: '#8a8a8a' };

function getCols() {
  return (
    db.collections ||
    (db.collections = CONFIG.slides.map((s, i) => ({
      id: i + 1,
      title: s.title,
      cat: s.cat,
      image: s.image || '',
      images: [],
      active: true
    })))
  );
}

function activeCols() {
  return getCols().filter(c => c.active);
}

const STAT = ['Chờ xác nhận', 'Đã xác nhận', 'Đang chuẩn bị', 'Đang giao', 'Đã giao', 'Đã hủy'];

const NEXT = { 0: [1, 5], 1: [2, 5], 2: [3, 5], 3: [4], 4: [], 5: [] };

const NAMES = {
  ao: ['Áo thun basic', 'Áo sơ mi linen', 'Áo polo pique', 'Áo len cổ tròn'],
  quan: ['Quần jean slim', 'Quần kaki ống đứng', 'Quần short linen', 'Quần jogger nỉ'],
  vay: ['Váy midi xếp ly', 'Váy sơ mi dáng dài', 'Váy suông cotton', 'Chân váy chữ A'],
  khoac: ['Áo khoác bomber', 'Áo khoác denim', 'Áo blazer oversize', 'Áo khoác gió'],
  pk: ['Mũ lưỡi trai', 'Thắt lưng da', 'Khăn lụa', 'Túi tote canvas']
};

/* ==========================================================================
  4. KHO DỮ LIỆU & TRẠNG THÁI (db, S, hàm đọc dữ liệu, khởi tạo)
   ========================================================================== */

let db,
  S = {
    view: 'home',
    arg: null,
    f: { q: '', cat: '', sort: 'new', size: '', color: '', stock: false, min: '', max: '', page: 1 },
    sel: {},
    img: 0,
    adm: 'dash',
    busy: false,
    open: null,
    aq: '',
    as: '',
    cq: ''
  };

let save = () => {
  try {
    localStorage.setItem(LS, JSON.stringify(db));
  } catch (e) {
    toast('Bộ nhớ trình duyệt đã đầy, dữ liệu mới có thể không được lưu');
  }
};

const user = () => db.users.find(u => u.id === db.session) || null;

const key = () => (user() ? user().id : 'guest');

const cart = () => db.carts[key()] || (db.carts[key()] = []);

const P = id => db.products.find(p => p.id == id);

const pp = p => p.sale || p.price;

let rate = p => {
  const r = db.reviews[p.id] || [];
  return r.length ? r.reduce((s, x) => s + x.r, 0) / r.length : 0;
};

const instock = p => Object.values(p.stock).some(v => v > 0);

const stars = r => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));

async function init() {
  try {
    db = JSON.parse(localStorage.getItem(LS));
  } catch (e) {}
  if (db && db.v === 1) return;
  const A = await sha('Admin@12345'),
    K = await sha('Khach@12345');
  db = {
    v: 1,
    session: null,
    users: [
      {
        id: 1,
        email: 'admin@shop.local',
        name: 'Quản trị viên',
        phone: '',
        role: 'admin',
        ok: true,
        pw: A,
        date: Date.now() - 2e10
      },
      {
        id: 2,
        email: 'khach@shop.local',
        name: 'Nguyễn Văn A',
        phone: '0901234567',
        role: 'user',
        ok: true,
        pw: K,
        date: Date.now() - 1e10
      }
    ],
    products: [],
    orders: [],
    carts: {},
    wish: {},
    reviews: {}
  };
  let n = 0;
  for (const [c] of CATS)
    for (const name of NAMES[c]) {
      n++;
      const price = (150 + ((n * 37) % 600)) * 1000,
        sizes = c === 'pk' ? ['FREE'] : ['S', 'M', 'L', 'XL'],
        colors = Object.keys(COLS).slice(0, 2 + (n % 2)),
        stock = {};
      sizes.forEach(s =>
        colors.forEach((cl, i) => (stock[s + '|' + cl] = n % 7 === 0 ? 0 : 3 + ((n + i) % 12)))
      );
      db.products.push({
        id: n,
        slug: slug(name),
        name,
        cat: c,
        price,
        sale: n % 4 === 0 ? Math.round((price * 0.8) / 1000) * 1000 : 0,
        sold: (n * 13) % 90,
        mat: 'Cotton 100%',
        desc: name + ' thiết kế tối giản, form chuẩn, dễ phối đồ hằng ngày.',
        sizes,
        colors,
        stock,
        date: Date.now() - n * 864e5
      });
      db.reviews[n] = [
        {
          u: ['Lan Anh', 'Minh Khoa', 'Thu Hà', 'Quốc Bảo'][n % 4],
          r: 3 + (n % 3),
          c: 'Chất vải tốt, đúng mô tả, giao hàng nhanh.',
          d: Date.now() - n * 3e8
        },
        {
          u: ['Hoàng Nam', 'Phương Linh', 'Đức Anh'][n % 3],
          r: 4 + (n % 2),
          c: 'Mặc vừa vặn, form đẹp, sẽ mua thêm.',
          d: Date.now() - n * 5e8
        }
      ];
    }
  for (let i = 0; i < 9; i++) {
    const p = P(1 + i * 2),
      q = 1 + (i % 3),
      sub = pp(p) * q,
      fee = sub >= 5e5 ? 0 : 3e4,
      st = i % 9 === 8 ? 5 : i < 6 ? 4 : i % 3;
    db.orders.push({
      id: 'DH' + (1000 + i),
      uid: 2,
      date: Date.now() - (8 - i) * 17 * 864e5,
      status: st,
      name: 'Nguyễn Văn A',
      phone: '0901234567',
      email: 'khach@shop.local',
      addr: '12 Lê Lợi, Bến Nghé, Quận 1, TP.HCM',
      pay: 'COD',
      ship: fee,
      sub,
      total: sub + fee,
      items: [{ pid: p.id, name: p.name, size: p.sizes[0], color: p.colors[0], price: pp(p), qty: q }]
    });
  }
  save();
}

/* ==========================================================================
  5. HÌNH ẢNH (ảnh sản phẩm, ảnh minh họa, xử lý tệp tải lên)
   ========================================================================== */

function svgImg(p, i = 0) {
  const c = CATS.find(c => c[0] === p.cat)[2];
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500'><rect width='400' height='500' fill='${c}'/><rect x='${70 + i * 25}' y='${100 + i * 15}' width='${260 - i * 50}' height='${300 - i * 30}' rx='${i ? 130 : 18}' fill='#00000014'/><text x='200' y='262' font-family='sans-serif' font-size='21' text-anchor='middle' fill='#333'>${esc(p.name)}</text></svg>`
    )
  );
}

function img(p, i = 0) {
  const L = p.images || [];
  if (L.length) return L[Math.min(i, L.length - 1)];
  if (CONFIG.imageDir && p.slug) return `${CONFIG.imageDir}/${p.slug}-${i}.jpg`;
  return svgImg(p, i);
}

document.addEventListener(
  'error',
  e => {
    const t = e.target;
    if (!CONFIG.imageDir || !t || t.tagName !== 'IMG') return;
    const m = new RegExp('^' + CONFIG.imageDir + '/(.+)-(\\d)\\.jpg$').exec(t.getAttribute('src') || '');
    const p = m && db.products.find(x => x.slug === m[1]);
    if (p) t.src = svgImg(p, +m[2]);
  },
  true
);

let storeImage = async d => d;

function fileToDataUrl(f, max = 900) {
  return new Promise((res, rej) => {
    if (!/^image\//.test(f.type)) return rej(new Error('Tệp không phải ảnh'));
    const r = new FileReader();
    r.onerror = () => rej(new Error('Không đọc được tệp'));
    r.onload = () => {
      const im = new Image();
      im.onerror = () => rej(new Error('Ảnh không hợp lệ'));
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height)),
          c = document.createElement('canvas');
        c.width = Math.round(im.width * k);
        c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.82));
      };
      im.src = r.result;
    };
    r.readAsDataURL(f);
  });
}

/* ==========================================================================
  6. THÀNH PHẦN DÙNG CHUNG (thẻ sản phẩm, ô mật khẩu, huy hiệu, cửa sổ)
   ========================================================================== */

function card(p) {
  const w = (db.wish[key()] || []).includes(p.id),
    d = p.sale ? Math.round(100 - (p.sale / p.price) * 100) : 0;
  return `<article class="card"><div class="ph" data-a="go" data-p="detail:${p.id}"><img src="${img(p, 0)}" alt="${esc(p.name)}" loading="lazy"><img src="${img(p, 1)}" alt="" loading="lazy">${d ? `<span class="tag">-${d}%</span>` : ''}${instock(p) ? '' : '<span class="tag g">Hết hàng</span>'}</div><button class="heart" data-a="wish" data-p="${p.id}" aria-label="Yêu thích">${w ? '♥' : '♡'}</button><div class="ci"><span class="nm" data-a="go" data-p="detail:${p.id}">${esc(p.name)}</span><span class="st">${stars(rate(p))} <span class="mut">(${(db.reviews[p.id] || []).length})</span></span><span class="pr"><b>${vnd(pp(p))}</b>${p.sale ? `<s>${vnd(p.price)}</s>` : ''}</span><button class="btn s o" data-a="quick" data-p="${p.id}" ${instock(p) ? '' : 'disabled'}>Thêm vào giỏ</button></div></article>`;
}

const EYE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  EYE_OFF =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19C5 19 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

const pwf = (id, extra = '') =>
  `<div class="pw"><input id="${id}" type="password"${extra}><button type="button" class="eye" data-a="eye" aria-label="Hiện mật khẩu" aria-pressed="false">${EYE}</button></div>`;

const stB = s => `<span class="badge${s === 4 ? ' c4' : s === 5 ? ' c5' : ''}">${STAT[s]}</span>`;

function ordTbl(o, rev) {
  return `<div class="box" style="margin:8px 0"><p><b>Mã đơn:</b> ${o.id} · ${new Date(o.date).toLocaleDateString('vi-VN')} · ${stB(o.status)}</p>${o.items.map(i => `<p class="row" style="justify-content:space-between;margin:4px 0"><span>${esc(i.name)} (${i.size}/${i.color}) ×${i.qty}</span><span>${vnd(i.price * i.qty)}${rev && o.status === 4 && i.pid ? ` <button class="btn o s" data-a="rvgo" data-p="${i.pid}">Đánh giá</button>` : ''}</span></p>`).join('')}<p class="mut">Giao đến: ${esc(o.name)} · ${esc(o.phone)} · ${esc(o.addr)}<br>Thanh toán: ${o.pay}</p><p><b>Tổng: ${vnd(o.total)}</b> <span class="mut">(phí giao ${o.ship ? vnd(o.ship) : '0₫'})</span></p></div>`;
}

function modal(h) {
  $('#modal').innerHTML = h
    ? `<div class="ov" data-a="mclose"><div class="md" role="dialog" aria-modal="true">${h}</div></div>`
    : '';
}

/* ==========================================================================
  7. TRANG CHỦ & BĂNG CHUYỀN BỘ SƯU TẬP
   ========================================================================== */

function home() {
  const AC = activeCols();
  const top = [...db.products].sort((a, b) => b.sold - a.sold).slice(0, 8),
    nw = [...db.products].sort((a, b) => b.date - a.date).slice(0, 4);
  return `<section class="hero"><div><h1>Mặc đẹp, không cần cầu kỳ.</h1><p>Bộ sưu tập thu đông tối giản: chất liệu tốt, form chuẩn, dễ phối mỗi ngày.</p><div class="row"><button class="btn" data-a="go" data-p="products">Mua ngay</button><button class="btn o" data-a="newcol">Khám phá bộ sưu tập</button></div></div>${carouselHtml(AC, top)}</section>
 <h2>Danh mục</h2><div class="cats">${CATS.map(c => `<div class="cat" data-a="cat" data-p="${c[0]}"><img src="${CONFIG.categoryImages[c[0]] || img({ cat: c[0], name: c[1] }, 2)}" alt="${c[1]}"><b>${c[1]}</b></div>`).join('')}</div>
 <h2>Sản phẩm nổi bật</h2><div class="grid">${top.map(card).join('')}</div>
 <div class="promo"><div><h3>Giảm đến 20% bộ sưu tập chọn lọc</h3><span>Miễn phí vận chuyển cho đơn từ 500.000₫</span></div><button class="btn" data-a="sale">Xem khuyến mãi</button></div>
 <h2 id="newcol">Bộ sưu tập mới</h2><div class="grid">${nw.map(card).join('')}</div>`;
}

/* Trang chi tiết bộ sưu tập: nhiều ảnh minh họa, mỗi ảnh có mô tả riêng, kèm sản phẩm của danh mục */
function colView() {
  const c = getCols().find(x => x.id == S.arg);
  if (!c) return '<div class="empty"><h2>Không tìm thấy bộ sưu tập</h2><button class="btn" data-a="go" data-p="home">Về trang chủ</button></div>';
  const pics = colPics(c),
    prods = db.products.filter(p => p.cat === c.cat),
    cat = CATS.find(x => x[0] === c.cat),
    cn = cat ? esc(cat[1]) : '';
  return `<div class="colhead"><button class="btn o s" data-a="go" data-p="home">← Trang chủ</button><span class="mut">Bộ sưu tập</span><h1>${esc(c.title)}</h1></div>
  ${pics.length ? `<div class="cgal">${pics.map((m, i) => `<figure class="cfig" data-a="lbopen" data-p="${i}" tabindex="0"><img src="${esc(m.url)}" alt="${esc(m.caption || c.title)}" loading="lazy">${m.caption ? `<figcaption>${esc(m.caption)}</figcaption>` : ''}</figure>`).join('')}</div>` : '<p class="mut">Bộ sưu tập này chưa có ảnh minh họa.</p>'}
  <h2>Sản phẩm trong bộ sưu tập${cn ? ' · ' + cn : ''}</h2>
  ${prods.length ? `<div class="grid">${prods.map(card).join('')}</div><div style="text-align:center;margin-top:20px"><button class="btn o" data-a="cat" data-p="${c.cat}">Xem tất cả ${cn}</button></div>` : '<p class="mut">Chưa có sản phẩm trong danh mục này.</p>'}`;
}
function lbHtml(c, i) {
  const L = colPics(c),
    m = L[i];
  return `<div class="lb"><img class="lbimg" src="${esc(m.url)}" alt="${esc(m.caption || c.title)}">${m.caption ? `<p class="lbcap">${esc(m.caption)}</p>` : ''}<div class="row" style="justify-content:space-between"><span class="mut">${i + 1} / ${L.length}</span><div class="row"><button class="btn o s" data-a="lbgo" data-p="-1"${L.length > 1 ? '' : ' disabled'}>‹ Trước</button><button class="btn o s" data-a="lbgo" data-p="1"${L.length > 1 ? '' : ' disabled'}>Sau ›</button><button class="btn s" data-a="mclose">Đóng</button></div></div></div>`;
}

function carouselHtml(AC, top) {
  if (!AC.length)
    return `<img src="${img(top[0], 0)}" alt="MONO" style="border-radius:14px;width:100%;aspect-ratio:1/1;object-fit:cover">`;
  return `<div class="car" id="car" role="region" aria-roledescription="carousel" aria-label="Bộ sưu tập nổi bật"><div class="trk" id="trk">${AC.map(c => `<div class="sl" data-a="${c.id > 0 ? 'colv' : 'cat'}" data-p="${c.id > 0 ? c.id : c.cat}" title="Xem bộ sưu tập ${esc(c.title)}"><img src="${esc(colImg(c))}" alt="Bộ sưu tập ${esc(c.title)}"><div class="cap"><span>Bộ sưu tập</span><h3>${esc(c.title)}</h3></div></div>`).join('')}</div><button class="cb pv" data-a="cgo" data-p="-1" aria-label="Slide trước">‹</button><button class="cb nx" data-a="cgo" data-p="1" aria-label="Slide sau">›</button><div class="dots">${AC.map((_, i) => `<button class="${i ? '' : 'on'}" data-a="cto" data-p="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}</div></div>`;
}

const colPics = c => (c.images && c.images.length ? c.images : c.image ? [{ url: c.image, caption: '' }] : []);
const colImg = c => (colPics(c)[0] || {}).url || img(db.products.find(p => p.cat === c.cat) || { cat: c.cat, name: c.title }, 0);

let ci = 0,
  ct = null,
  cp = false;

function carGo(i) {
  const n = activeCols().length || 1;
  ci = (i + n) % n;
  const t = $('#trk');
  if (!t) return;
  t.style.transform = `translateX(-${ci * 100}%)`;
  document.querySelectorAll('.dots button').forEach((d, k) => {
    d.classList.toggle('on', k === ci);
    d.setAttribute('aria-current', k === ci);
  });
}

function restartCar() {
  clearInterval(ct);
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  ct = setInterval(() => {
    if (!$('#car')) {
      clearInterval(ct);
      return;
    }
    if (!cp && !document.hidden) carGo(ci + 1);
  }, 4000);
}

function startCar() {
  ci = 0;
  cp = false;
  const c = $('#car');
  if (!c) return;
  c.addEventListener('mouseenter', () => (cp = true));
  c.addEventListener('mouseleave', () => (cp = false));
  c.addEventListener('focusin', () => (cp = true));
  c.addEventListener('focusout', () => (cp = false));
  let x0 = null;
  c.addEventListener(
    'touchstart',
    e => {
      x0 = e.touches[0].clientX;
      cp = true;
    },
    { passive: true }
  );
  c.addEventListener(
    'touchend',
    e => {
      if (x0 !== null) {
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) {
          carGo(ci + (dx < 0 ? 1 : -1));
          restartCar();
        }
        x0 = null;
      }
      cp = false;
    },
    { passive: true }
  );
  restartCar();
}

/* ==========================================================================
  8. TRANG SẢN PHẨM (danh sách, bộ lọc, chi tiết)
   ========================================================================== */

function filt() {
  const f = S.f;
  let l = db.products.filter(
    p =>
      (!f.q || p.name.toLowerCase().includes(f.q.toLowerCase())) &&
      (!f.cat || p.cat === f.cat) &&
      (!f.min || pp(p) >= +f.min) &&
      (!f.max || pp(p) <= +f.max) &&
      (f.cat !== 'sale' || p.sale) &&
      (!f.size || p.sizes.includes(f.size)) &&
      (!f.color || p.colors.includes(f.color)) &&
      (!f.stock || instock(p))
  );
  if (f.cat === 'sale') l = db.products.filter(p => p.sale);
  const o = {
    new: (a, b) => b.date - a.date,
    pa: (a, b) => pp(a) - pp(b),
    pd: (a, b) => pp(b) - pp(a),
    best: (a, b) => b.sold - a.sold,
    rate: (a, b) => rate(b) - rate(a)
  };
  return l.sort(o[f.sort]);
}

function products() {
  const f = S.f,
    l = filt(),
    pg = Math.max(1, Math.ceil(l.length / 12)),
    page = Math.min(f.page, pg),
    sizes = ['S', 'M', 'L', 'XL', 'FREE'];
  const side = `<aside class="side" id="side"><div class="mo row" style="justify-content:space-between"><b>Bộ lọc</b><button class="btn s" data-a="side">Đóng</button></div>
 <label>Danh mục</label><select data-f="cat"><option value="">Tất cả</option><option value="sale"${f.cat === 'sale' ? ' selected' : ''}>Khuyến mãi</option>${CATS.map(c => `<option value="${c[0]}"${f.cat === c[0] ? ' selected' : ''}>${c[1]}</option>`).join('')}</select>
 <label>Giá (₫)</label><div class="f2"><input data-f="min" type="number" min="0" placeholder="Từ" value="${f.min}"><input data-f="max" type="number" min="0" placeholder="Đến" value="${f.max}"></div>
 <label>Size</label><div class="chips">${sizes.map(s => `<button class="chip${f.size === s ? ' on' : ''}" data-a="fs" data-p="size:${s}">${s}</button>`).join('')}</div>
 <label>Màu sắc</label><div class="row">${Object.entries(COLS)
   .map(
     ([n, c]) =>
       `<button class="sw${f.color === n ? ' on' : ''}" style="background:${c}" data-a="fs" data-p="color:${n}" aria-label="${n}"></button>`
   )
   .join('')}</div>
 <label><input type="checkbox" data-f="stock" style="width:auto"${f.stock ? ' checked' : ''}> Chỉ còn hàng</label><button class="btn o s" style="margin-top:12px" data-a="reset">Xóa bộ lọc</button></aside>`;
  return `<div class="lay">${side}<section><div class="row" style="justify-content:space-between;margin-bottom:14px"><h1 style="margin:0;font-size:22px">${f.cat && f.cat !== 'sale' ? CATS.find(c => c[0] === f.cat)[1] : f.cat === 'sale' ? 'Khuyến mãi' : 'Tất cả sản phẩm'} <span class="mut" style="font-size:14px">(${l.length})</span></h1><div class="row"><button class="btn o s mo" data-a="side">Bộ lọc</button><select data-f="sort" style="width:auto" aria-label="Sắp xếp"><option value="new">Mới nhất</option><option value="pa"${f.sort === 'pa' ? ' selected' : ''}>Giá thấp → cao</option><option value="pd"${f.sort === 'pd' ? ' selected' : ''}>Giá cao → thấp</option><option value="best"${f.sort === 'best' ? ' selected' : ''}>Bán chạy</option><option value="rate"${f.sort === 'rate' ? ' selected' : ''}>Đánh giá cao</option></select></div></div>
 ${
   l.length
     ? `<div class="grid">${l
         .slice((page - 1) * 12, page * 12)
         .map(card)
         .join('')}</div>`
     : '<div class="empty"><h3>Không tìm thấy sản phẩm</h3><p>Thử đổi bộ lọc hoặc từ khóa khác.</p><button class="btn" data-a="reset">Xóa bộ lọc</button></div>'
 }
 ${pg > 1 ? `<div class="pag">${Array.from({ length: pg }, (_, i) => `<button class="chip${page === i + 1 ? ' on' : ''}" data-a="pg" data-p="${i + 1}">${i + 1}</button>`).join('')}</div>` : ''}</section></div>`;
}

function detail() {
  const p = P(S.arg);
  if (!p) return '<div class="empty">Không tìm thấy sản phẩm.</div>';
  const s = S.sel,
    im = p.images && p.images.length ? p.images.map((_, i) => i) : [0, 1, 2],
    av = (sz, cl) => p.stock[sz + '|' + cl] || 0;
  const max = s.size && s.color ? av(s.size, s.color) : 0,
    w = (db.wish[key()] || []).includes(p.id),
    rv = db.reviews[p.id] || [],
    rel = db.products.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4);
  return `<div class="det"><div><img class="big" src="${img(p, S.img)}" alt="${esc(p.name)}"><div class="th">${im.map(i => `<img src="${img(p, i)}" class="${S.img === i ? 'on' : ''}" data-a="gi" data-p="${i}" alt="Ảnh ${i + 1}">`).join('')}</div></div>
 <div><span class="mut">${CATS.find(c => c[0] === p.cat)[1]}</span><h1>${esc(p.name)}</h1><div class="st">${stars(rate(p))} <span class="mut">${rate(p).toFixed(1)} (${rv.length} đánh giá)</span></div>
 <p class="pr"><b style="font-size:24px">${vnd(pp(p))}</b>${p.sale ? `<s>${vnd(p.price)}</s> <span class="badge">-${Math.round(100 - (p.sale / p.price) * 100)}%</span>` : ''}</p><p class="mut">${esc(p.desc)}</p>
 <b>Màu sắc</b><div class="row" style="margin:6px 0 14px">${p.colors.map(c => `<button class="sw${s.color === c ? ' on' : ''}" style="background:${COLS[c]}" data-a="sel" data-p="color:${c}" aria-label="${c}" title="${c}"></button>`).join('')}</div>
 <b>Size</b><div class="chips" style="margin:6px 0 14px">${p.sizes
   .map(z => {
     const out = s.color ? av(z, s.color) < 1 : p.colors.every(c => av(z, c) < 1);
     return `<button class="chip${s.size === z ? ' on' : ''}${out ? ' x' : ''}" data-a="sel" data-p="size:${z}">${z}</button>`;
   })
   .join('')}</div>
 <div class="row" style="margin-bottom:6px"><b>Số lượng</b><button class="btn o s" data-a="qty" data-p="-1">−</button><b>${s.qty || 1}</b><button class="btn o s" data-a="qty" data-p="1">+</button><span class="mut">${s.size && s.color ? (max > 0 ? `Còn ${max} sản phẩm` : 'Hết hàng') : instock(p) ? 'Còn hàng' : 'Hết hàng'}</span></div>
 <div class="err" id="serr"></div><div class="row"><button class="btn" data-a="add" data-p="0" ${instock(p) ? '' : 'disabled'}>Thêm vào giỏ</button><button class="btn o" data-a="add" data-p="1" ${instock(p) ? '' : 'disabled'}>Mua ngay</button><button class="btn o" data-a="wish" data-p="${p.id}">${w ? '♥ Đã thích' : '♡ Yêu thích'}</button></div></div></div>
 <h2>Thông tin chi tiết</h2><div class="box"><p><b>Chất liệu:</b> ${esc(p.mat)}</p><p><b>Bảo quản:</b> Giặt máy ở 30°C, không dùng chất tẩy mạnh, phơi trong bóng râm, ủi nhiệt độ thấp.</p></div>
 <h2 id="reviews">Đánh giá khách hàng</h2>${reviewsHtml(p, rv)}
 <h2>Sản phẩm liên quan</h2><div class="grid">${rel.map(card).join('')}</div>`;
}

const canReview = pid =>
  !!user() && db.orders.some(o => o.uid === db.session && o.status === 4 && o.items.some(i => i.pid == pid));

function reviewsHtml(p, rv) {
  const n = rv.length,
    avg = n ? rv.reduce((s, x) => s + x.r, 0) / n : 0,
    dist = [5, 4, 3, 2, 1].map(k => rv.filter(x => Math.round(x.r) === k).length);
  const sum = n
    ? `<div class="box rvsum"><div class="rvavg"><b>${avg.toFixed(1)}</b><span class="st">${stars(avg)}</span><span class="mut">${n} đánh giá</span></div><div class="rvdist">${dist.map((c, i) => `<div class="rvrow"><span>${5 - i}★</span><i><u style="width:${Math.round((c / n) * 100)}%"></u></i><span class="mut">${c}</span></div>`).join('')}</div></div>`
    : '';
  const list = n
    ? [...rv]
        .sort((a, b) => (b.d || 0) - (a.d || 0))
        .map(
          r =>
            `<div class="box rvitem"><div class="row" style="justify-content:space-between"><b>${esc(r.u || 'Khách hàng')}</b><span class="mut" style="font-size:12px">${r.d ? new Date(r.d).toLocaleDateString('vi-VN') : ''}</span></div><span class="st">${stars(r.r)}</span><p style="margin:4px 0 0">${esc(r.c)}</p></div>`
        )
        .join('')
    : '<p class="mut">Chưa có đánh giá nào. Hãy là người đầu tiên sau khi mua hàng!</p>';
  return sum + `<div class="rvlist">${list}</div>` + reviewForm(p, rv);
}

function reviewForm(p, rv) {
  const u = user();
  if (!u)
    return `<div class="box" style="margin-top:12px"><p class="mut" style="margin:0">Mua hàng và đăng nhập để viết đánh giá. <a class="lnk" data-a="go" data-p="auth:login" style="text-decoration:underline" tabindex="0">Đăng nhập</a></p></div>`;
  if (!canReview(p.id))
    return `<div class="box" style="margin-top:12px"><p class="mut" style="margin:0">Bạn có thể đánh giá sản phẩm này sau khi đơn hàng được giao thành công.</p></div>`;
  const mine = rv.find(r => r.uid === u.id) || {},
    cur = S.rv && S.rv.pid === p.id ? S.rv : (S.rv = { pid: p.id, r: mine.r || 0 });
  return `<div class="box" id="rvform" style="margin-top:12px"><h3>${mine.r ? 'Cập nhật đánh giá của bạn' : 'Viết đánh giá của bạn'}</h3><div class="rvstars" role="radiogroup" aria-label="Chọn số sao">${[1, 2, 3, 4, 5].map(k => `<button type="button" class="rvs${k <= cur.r ? ' on' : ''}" data-a="rvstar" data-p="${k}" role="radio" aria-checked="${k === cur.r}" aria-label="${k} sao">★</button>`).join('')}</div><div class="fld"><label for="rv_c">Nhận xét</label><textarea id="rv_c" rows="3" maxlength="1000" placeholder="Chất liệu, form dáng, chất lượng…">${esc(mine.c || '')}</textarea></div><div class="err" id="rv_e"></div><button class="btn" data-a="rvsend">${mine.r ? 'Cập nhật đánh giá' : 'Gửi đánh giá'}</button></div>`;
}

let reviewSave = async (pid, r, c) => {
  const l = db.reviews[pid] || (db.reviews[pid] = []),
    m = l.find(x => x.uid === db.session),
    row = { u: user().name, uid: db.session, r, c, d: Date.now() };
  m ? Object.assign(m, row) : l.push(row);
  save();
};

/* ==========================================================================
  9. GIỎ HÀNG & THANH TOÁN
   ========================================================================== */

function lines() {
  return cart()
    .map(i => {
      const p = P(i.pid);
      return p ? { ...i, p, max: p.stock[i.size + '|' + i.color] || 0, tot: pp(p) * i.qty } : null;
    })
    .filter(Boolean);
}

function totals() {
  const l = lines(),
    sub = l.reduce((s, x) => s + x.tot, 0),
    ship = !sub ? 0 : sub >= 5e5 ? 0 : S.fast ? 5e4 : 3e4;
  return { l, sub, ship, total: sub + ship };
}

function cartV() {
  const t = totals();
  if (!t.l.length)
    return '<div class="empty"><h2>Giỏ hàng trống</h2><p>Hãy chọn vài món bạn thích.</p><button class="btn" data-a="go" data-p="products">Tiếp tục mua sắm</button></div>';
  return `<h1 style="margin-top:20px">Giỏ hàng</h1><div class="two"><div class="tw"><table><tr><th>Sản phẩm</th><th>Giá</th><th>SL</th><th>Tổng</th><th></th></tr>${t.l.map((x, i) => `<tr><td><div class="row" style="flex-wrap:nowrap"><img src="${img(x.p)}" alt="${esc(x.p.name)}" style="width:56px;border-radius:8px"><div><b>${esc(x.p.name)}</b><br><span class="mut">${x.size} · ${x.color}</span></div></div></td><td>${vnd(pp(x.p))}</td><td><div class="row" style="flex-wrap:nowrap"><button class="btn o s" data-a="cq" data-p="${i}:-1">−</button>${x.qty}<button class="btn o s" data-a="cq" data-p="${i}:1">+</button></div></td><td>${vnd(x.tot)}</td><td><button class="ib" data-a="cdel" data-p="${i}" aria-label="Xóa">✕</button></td></tr>`).join('')}</table></div>
 <div class="box"><h3>Tóm tắt</h3><p class="row" style="justify-content:space-between">Tạm tính<b>${vnd(t.sub)}</b></p><p class="row" style="justify-content:space-between">Phí vận chuyển<b>${t.ship ? vnd(t.ship) : 'Miễn phí'}</b></p><p class="row" style="justify-content:space-between">Giảm giá<b>0₫</b></p><hr style="border:0;border-top:1px solid var(--line)"><p class="row" style="justify-content:space-between">Tổng cộng<b style="font-size:20px">${vnd(t.total)}</b></p><button class="btn" style="width:100%" data-a="checkout">Tiến hành thanh toán</button></div></div>`;
}

function checkout() {
  const t = totals(),
    u = user(),
    c = S.co || {};
  if (!t.l.length) return cartV();
  const F = (id, l, v = '', tp = 'text') =>
    `<div class="fld"><label for="${id}">${l}</label><input id="${id}" type="${tp}" value="${esc(c[id] ?? v)}" autocomplete="off"><div class="err" id="e_${id}"></div></div>`;
  return `<h1 style="margin-top:20px">Thanh toán</h1><div class="two"><div><div class="box"><h3>1. Thông tin giao hàng</h3><div class="f2">${F('co_name', 'Họ tên', u.name)}${F('co_phone', 'Số điện thoại', u.phone, 'tel')}</div>${F('co_email', 'Email', u.email, 'email')}${F('co_addr', 'Địa chỉ')}<div class="f2">${F('co_prov', 'Tỉnh/thành phố')}${F('co_dist', 'Quận/huyện')}</div>${F('co_ward', 'Phường/xã')}<div class="fld"><label for="co_note">Ghi chú</label><textarea id="co_note" rows="2">${esc(c.co_note || '')}</textarea></div></div>
 <div class="box" style="margin-top:14px"><h3>2. Vận chuyển</h3><label><input type="radio" name="sh" style="width:auto" data-a="ship" data-p="0" ${S.fast ? '' : 'checked'}> Tiêu chuẩn (2–4 ngày) — ${t.sub >= 5e5 ? 'Miễn phí' : '30.000₫'}</label><br><label><input type="radio" name="sh" style="width:auto" data-a="ship" data-p="1" ${S.fast ? 'checked' : ''}> Nhanh (1–2 ngày) — ${t.sub >= 5e5 ? 'Miễn phí' : '50.000₫'}</label></div>
 <div class="box" style="margin-top:14px"><h3>3. Thanh toán</h3><label><input type="radio" checked style="width:auto"> Thanh toán khi nhận hàng (COD)</label><br><label class="mut"><input type="radio" disabled style="width:auto"> Thanh toán online (sắp có)</label></div></div>
 <div class="box"><h3>4. Xác nhận đơn hàng</h3>${t.l.map(x => `<p class="row" style="justify-content:space-between;margin:6px 0"><span>${esc(x.p.name)} (${x.size}/${x.color}) ×${x.qty}</span><b>${vnd(x.tot)}</b></p>`).join('')}<hr style="border:0;border-top:1px solid var(--line)"><p class="row" style="justify-content:space-between">Tạm tính<b>${vnd(t.sub)}</b></p><p class="row" style="justify-content:space-between">Phí giao hàng<b>${t.ship ? vnd(t.ship) : 'Miễn phí'}</b></p><p class="row" style="justify-content:space-between">Tổng thanh toán<b style="font-size:20px">${vnd(t.total)}</b></p><button class="btn" id="place" style="width:100%" data-a="place" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Đang xử lý…' : 'Đặt hàng'}</button></div></div>`;
}

function addItem(pid, size, color, qty) {
  const pr = P(pid),
    mx = pr.stock[size + '|' + color] || 0,
    l = cart(),
    ex = l.find(i => i.pid === pid && i.size === size && i.color === color),
    q = (ex ? ex.qty : 0) + qty;
  if (q > mx) {
    toast(mx ? 'Chỉ còn ' + mx + ' sản phẩm trong kho' : 'Biến thể này đã hết hàng');
    return false;
  }
  ex ? (ex.qty = q) : l.push({ pid, size, color, qty });
  save();
  render();
  toast('Đã thêm vào giỏ hàng');
  return true;
}

function keepCo() {
  S.co = {};
  document.querySelectorAll('[id^=co_]').forEach(e => (S.co[e.id] = e.value));
}

function placeOrder() {
  if (S.busy) return;
  keepCo();
  const c = S.co,
    v = (id, ok, m) => {
      $('#e_' + id) && ($('#e_' + id).textContent = ok ? '' : m);
      return ok;
    };
  const r = [
    v('co_name', (c.co_name || '').trim().length >= 2, 'Nhập họ tên'),
    v('co_phone', /^0\d{9}$/.test(c.co_phone || ''), 'Số điện thoại gồm 10 số, bắt đầu bằng 0'),
    v('co_email', /^\S+@\S+\.\S+$/.test(c.co_email || ''), 'Email không hợp lệ'),
    v('co_addr', (c.co_addr || '').trim().length >= 3, 'Nhập địa chỉ'),
    v('co_prov', !!(c.co_prov || '').trim(), 'Nhập tỉnh/thành phố'),
    v('co_dist', !!(c.co_dist || '').trim(), 'Nhập quận/huyện'),
    v('co_ward', !!(c.co_ward || '').trim(), 'Nhập phường/xã')
  ];
  if (r.includes(false)) return toast('Vui lòng kiểm tra lại thông tin giao hàng');
  const t = totals();
  for (const x of t.l) if (x.qty > x.max) return toast(`"${x.p.name}" (${x.size}/${x.color}) không đủ hàng`);
  S.busy = true;
  $('#place').disabled = true;
  $('#place').textContent = 'Đang xử lý…';
  setTimeout(() => {
    const id = 'DH' + Date.now().toString(36).toUpperCase();
    t.l.forEach(x => {
      x.p.stock[x.size + '|' + x.color] -= x.qty;
      x.p.sold += x.qty;
    });
    db.orders.push({
      id,
      uid: db.session,
      date: Date.now(),
      status: 0,
      name: c.co_name.trim(),
      phone: c.co_phone,
      email: c.co_email,
      addr: [c.co_addr, c.co_ward, c.co_dist, c.co_prov].join(', '),
      note: c.co_note || '',
      pay: 'COD',
      ship: t.ship,
      sub: t.sub,
      total: t.total,
      items: t.l.map(x => ({
        pid: x.pid,
        name: x.p.name,
        size: x.size,
        color: x.color,
        price: pp(x.p),
        qty: x.qty
      }))
    });
    db.carts[key()] = [];
    save();
    S.busy = false;
    S.co = null;
    S.fast = false;
    go('orders');
    toast('Đặt hàng thành công! Mã đơn: ' + id);
  }, 500);
}

/* ==========================================================================
  10. TÀI KHOẢN & ĐƠN HÀNG CỦA KHÁCH
   ========================================================================== */

function authV() {
  const reg = S.arg === 'register';
  return `<div style="max-width:420px;margin:40px auto" class="box"><h1 style="font-size:22px">${reg ? 'Đăng ký' : 'Đăng nhập'}</h1>${reg ? '<div class="fld"><label for="a_n">Họ tên</label><input id="a_n"></div>' : ''}<div class="fld"><label for="a_e">Email</label><input id="a_e" type="email" autocomplete="off"></div><div class="fld"><label for="a_p">Mật khẩu</label>${pwf('a_p', ` autocomplete="new-password"`)}</div><div class="err" id="aerr"></div><button class="btn" style="width:100%" data-a="${reg ? 'reg' : 'login'}">${reg ? 'Tạo tài khoản' : 'Đăng nhập'}</button><p class="mut" style="text-align:center">${reg ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} <a class="lnk" data-a="go" data-p="auth:${reg ? 'login' : 'register'}" style="text-decoration:underline">${reg ? 'Đăng nhập' : 'Đăng ký'}</a></p>${reg ? '' : '<p class="mut" style="font-size:12px;text-align:center"></p>'}</div>`;
}

function profile() {
  const u = user();
  return `<h1 style="margin-top:20px">Tài khoản</h1><div class="two eq"><div class="box"><h3>Thông tin cá nhân</h3><div class="fld"><label for="pf_n">Họ tên</label><input id="pf_n" value="${esc(u.name)}"></div><div class="fld"><label for="pf_p">Số điện thoại</label><input id="pf_p" value="${esc(u.phone || '')}"></div><div class="err" id="perr"></div><button class="btn" data-a="psave">Lưu thay đổi</button></div><div class="box"><h3>Đổi mật khẩu</h3><div class="fld"><label for="pw_o">Mật khẩu hiện tại</label>${pwf('pw_o')}</div><div class="fld"><label for="pw_n">Mật khẩu mới (tối thiểu 8 ký tự)</label>${pwf('pw_n')}</div><div class="err" id="werr"></div><button class="btn" data-a="pwsave">Đổi mật khẩu</button></div></div><div class="row" style="margin-top:16px"><button class="btn o" data-a="go" data-p="orders">Đơn hàng của tôi</button>${u.role === 'admin' ? '<button class="btn o" data-a="go" data-p="admin">Trang quản trị</button>' : ''}<button class="btn o" data-a="logout">Đăng xuất</button></div>`;
}

function ordersV() {
  const l = db.orders.filter(o => o.uid === db.session).sort((a, b) => b.date - a.date);
  return `<h1 style="margin-top:20px">Đơn hàng của tôi</h1>${l.length ? l.map(o => `<div class="box" style="margin-bottom:10px"><div class="row" style="justify-content:space-between"><div><b>${o.id}</b> · ${new Date(o.date).toLocaleDateString('vi-VN')}<br>${stB(o.status)}</div><div class="row"><b>${vnd(o.total)}</b><button class="btn o s" data-a="oopen" data-p="${o.id}">${S.open === o.id ? 'Ẩn' : 'Chi tiết'}</button>${o.status === 0 ? `<button class="btn d s" data-a="ocancel" data-p="${o.id}">Hủy đơn</button>` : ''}</div></div>${S.open === o.id ? ordTbl(o, true) : ''}</div>`).join('') : '<div class="empty"><p>Bạn chưa có đơn hàng nào.</p><button class="btn" data-a="go" data-p="products">Mua sắm ngay</button></div>'}`;
}

function wishV() {
  const l = (db.wish[key()] || []).map(P).filter(Boolean);
  return `<h1 style="margin-top:20px">Sản phẩm yêu thích</h1>${l.length ? `<div class="grid">${l.map(card).join('')}</div>` : '<div class="empty">Chưa có sản phẩm yêu thích.</div>'}`;
}

function loginAs(u) {
  const g = db.carts.guest || [];
  db.session = u.id;
  if (g.length) {
    const c = cart();
    g.forEach(i => {
      const e = c.find(x => x.pid === i.pid && x.size === i.size && x.color === i.color);
      e ? (e.qty += i.qty) : c.push(i);
    });
    delete db.carts.guest;
  }
  save();
  const a = S.after;
  S.after = null;
  toast('Xin chào, ' + u.name);
  go(a || (u.role === 'admin' ? 'admin' : 'home'));
}

/* ==========================================================================
  11. TRANG QUẢN TRỊ (admin: tổng quan, sản phẩm, đơn hàng, khách hàng, ảnh)
   ========================================================================== */

function admin() {
  const u = user();
  if (!u || u.role !== 'admin')
    return '<div class="empty"><h2>Không có quyền truy cập</h2><p>Hãy đăng nhập bằng tài khoản admin.</p><button class="btn" data-a="go" data-p="auth:login">Đăng nhập</button></div>';
  const tabs = [
    ['dash', 'Tổng quan'],
    ['aprod', 'Sản phẩm'],
    ['acol', 'Bộ sưu tập'],
    ['aord', 'Đơn hàng'],
    ['acus', 'Khách hàng']
  ];
  return (
    `<div class="tabs">${tabs.map(t => `<button class="chip${S.adm === t[0] ? ' on' : ''}" data-a="atab" data-p="${t[0]}">${t[1]}</button>`).join('')}</div>` +
    { dash: dash, aprod: aprod, aord: aord, acus: acus, acol: acol }[S.adm]()
  );
}

function dash() {
  const ok = db.orders.filter(o => o.status === 4),
    rev = ok.reduce((s, o) => s + o.total, 0),
    m = {};
  ok.forEach(o => {
    const k = new Date(o.doneAt || o.date).toISOString().slice(0, 7);
    m[k] = (m[k] || 0) + o.total;
  });
  const ks = Object.keys(m).sort().slice(-6),
    mx = Math.max(1, ...ks.map(k => m[k]));
  return `<div class="stats">${[
    ['Doanh thu', vnd(rev)],
    ['Đơn hàng', db.orders.length],
    ['Khách hàng', db.users.filter(u => u.role === 'user').length],
    ['Sản phẩm', db.products.length]
  ]
    .map(x => `<div class="box"><span class="mut">${x[0]}</span><b>${x[1]}</b></div>`)
    .join('')}</div>
 <div class="two" style="margin-top:20px"><div class="box"><h3>Doanh thu theo tháng</h3>${ks.length ? `<div class="bars">${ks.map(k => `<div><i style="height:${Math.round((m[k] / mx) * 110)}px"></i>${k.slice(5)}/${k.slice(2, 4)}</div>`).join('')}</div>` : '<p class="mut">Chưa có dữ liệu.</p>'}</div><div class="box"><h3>Sản phẩm bán chạy</h3>${[
   ...db.products
 ]
   .sort((a, b) => b.sold - a.sold)
   .slice(0, 5)
   .map(
     p =>
       `<p class="row" style="justify-content:space-between;margin:6px 0"><span>${esc(p.name)}</span><b>${p.sold}</b></p>`
   )
   .join('')}</div></div>
 <div class="box tw" style="margin-top:20px"><h3>Đơn hàng mới</h3><table><tr><th>Mã</th><th>Khách</th><th>Tổng</th><th>Trạng thái</th></tr>${[
   ...db.orders
 ]
   .sort((a, b) => b.date - a.date)
   .slice(0, 5)
   .map(
     o => `<tr><td>${o.id}</td><td>${esc(o.name)}</td><td>${vnd(o.total)}</td><td>${stB(o.status)}</td></tr>`
   )
   .join('')}</table></div>`;
}

function aprod() {
  const q = S.aq.toLowerCase(),
    l = db.products.filter(p => !q || p.name.toLowerCase().includes(q));
  return `<div class="row" style="margin-bottom:12px"><input data-f="aq" style="max-width:280px" placeholder="Tìm sản phẩm" value="${esc(S.aq)}"><button class="btn" data-a="pedit" data-p="0">+ Thêm sản phẩm</button></div><div class="box tw"><table><tr><th>Sản phẩm</th><th>Danh mục</th><th>Giá</th><th>Tồn kho</th><th></th></tr>${l.map(p => `<tr><td><div class="row" style="flex-wrap:nowrap"><img src="${img(p, 0)}" alt="" style="width:36px;height:45px;object-fit:cover;border-radius:6px">${esc(p.name)}${p.active === false ? ' <span class="badge">Đã ẩn</span>' : ''}</div></td><td>${CATS.find(c => c[0] === p.cat)[1]}</td><td>${vnd(pp(p))}</td><td>${Object.values(p.stock).reduce((a, b) => a + b, 0)}</td><td class="row"><button class="btn o s" data-a="pedit" data-p="${p.id}">Sửa</button><button class="btn d s" data-a="pdel" data-p="${p.id}">Xóa</button></td></tr>`).join('')}</table></div>`;
}

function aord() {
  const q = S.aq.toLowerCase(),
    l = db.orders
      .filter(o => (!q || o.id.toLowerCase().includes(q)) && (S.as === '' || o.status == S.as))
      .sort((a, b) => b.date - a.date);
  return `<div class="row" style="margin-bottom:12px"><input data-f="aq" style="max-width:240px" placeholder="Tìm theo mã đơn" value="${esc(S.aq)}"><select data-f="as" style="max-width:200px"><option value="">Mọi trạng thái</option>${STAT.map((s, i) => `<option value="${i}"${S.as !== '' && S.as == i ? ' selected' : ''}>${s}</option>`).join('')}</select><span class="mut">Doanh thu đã hoàn thành: <b style="color:var(--fg)">${vnd(revenue())}</b></span></div>${l.map(o => `<div class="box" style="margin-bottom:10px"><div class="row" style="justify-content:space-between"><div><b>${o.id}</b> · ${esc(o.name)} · ${vnd(o.total)}<br>${stB(o.status)}</div><div class="row"><button class="btn o s" data-a="oopen" data-p="${o.id}">${S.open === o.id ? 'Ẩn' : 'Chi tiết'}</button>${o.status < 4 ? `<button class="btn s" data-a="complete" data-p="${o.id}">Hoàn thành</button>` : ''}${NEXT[o.status].length ? `<select data-ost="${o.id}" style="width:auto"><option value="">Cập nhật trạng thái</option>${NEXT[o.status].map(s => `<option value="${s}">${STAT[s]}</option>`).join('')}</select>` : ''}</div></div>${S.open === o.id ? ordTbl(o) : ''}</div>`).join('') || '<div class="empty">Không có đơn hàng.</div>'}`;
}

function acus() {
  const q = S.cq.toLowerCase(),
    l = db.users.filter(
      u => u.role === 'user' && (!q || u.name.toLowerCase().includes(q) || u.email.includes(q))
    );
  return `<input data-f="cq" style="max-width:280px;margin-bottom:12px" placeholder="Tìm khách hàng" value="${esc(S.cq)}">${l
    .map(u => {
      const os = db.orders.filter(o => o.uid === u.id);
      return `<div class="box" style="margin-bottom:10px"><div class="row" style="justify-content:space-between"><div><b>${esc(u.name)}</b> ${u.ok ? '' : '<span class="badge c5">Đã khóa</span>'}<br><span class="mut">${esc(u.email)} · ${os.length} đơn · ${vnd(os.filter(o => o.status === 4).reduce((s, o) => s + o.total, 0))}</span></div><div class="row"><button class="btn o s" data-a="oopen" data-p="u${u.id}">Lịch sử mua hàng</button><button class="btn ${u.ok ? 'd' : 'o'} s" data-a="lock" data-p="${u.id}">${u.ok ? 'Khóa' : 'Mở khóa'}</button></div></div>${S.open === 'u' + u.id ? os.map(o => ordTbl(o)).join('') || '<p class="mut">Chưa có đơn.</p>' : ''}</div>`;
    })
    .join('')}`;
}

const revenue = () => db.orders.filter(o => o.status === 4).reduce((s, o) => s + o.total, 0);

let colSave = async (id, d) => {
  const l = getCols();
  if (id)
    Object.assign(
      l.find(c => c.id == id),
      d
    );
  else l.push({ id: Math.max(0, ...l.map(c => c.id)) + 1, ...d });
  save();
};

let colRemove = async id => {
  db.collections = getCols().filter(c => c.id != id);
  save();
};

let colMove = async (id, dir) => {
  const l = getCols(),
    i = l.findIndex(c => c.id == id),
    k = i + dir;
  if (i < 0 || k < 0 || k >= l.length) return;
  [l[i], l[k]] = [l[k], l[i]];
  save();
};

function acol() {
  const l = getCols();
  return `<div class="row" style="margin-bottom:12px;justify-content:space-between"><span class="mut">Bộ sưu tập hiển thị ở băng chuyền trang chủ theo thứ tự bên dưới.</span><div class="row">${l.length ? '' : '<button class="btn o" data-a="coldef">Nhập bộ sưu tập mặc định</button>'}<button class="btn" data-a="coledit" data-p="0">+ Thêm bộ sưu tập</button></div></div>${l.length ? l.map((c, i) => `<div class="box colrow"><img src="${esc(colImg(c))}" alt=""><div class="colinfo"><b>${esc(c.title)}</b><br><span class="mut">Danh mục: ${esc((CATS.find(x => x[0] === c.cat) || [0, c.cat])[1])} · ${colPics(c).length} ảnh · ${c.active ? 'Đang hiển thị' : 'Đang ẩn'}</span></div><div class="row"><button class="btn o s" data-a="colup" data-p="${c.id}" aria-label="Đưa lên"${i ? '' : ' disabled'}>↑</button><button class="btn o s" data-a="coldown" data-p="${c.id}" aria-label="Đưa xuống"${i < l.length - 1 ? '' : ' disabled'}>↓</button><button class="btn o s" data-a="coltog" data-p="${c.id}">${c.active ? 'Ẩn' : 'Hiện'}</button><button class="btn o s" data-a="coledit" data-p="${c.id}">Sửa</button><button class="btn d s" data-a="coldel" data-p="${c.id}">Xóa</button></div></div>`).join('') : '<div class="empty">Chưa có bộ sưu tập nào.</div>'}`;
}

function syncCaps() {
  document.querySelectorAll('[data-cap]').forEach(e => {
    if (S.cimgs[+e.dataset.cap]) S.cimgs[+e.dataset.cap].caption = e.value.trim();
  });
}
function colImgsHtml() {
  if (!S.cimgs.length) return '<p class="mut" style="margin:4px 0">Chưa có ảnh, sẽ dùng ảnh sản phẩm đầu tiên của danh mục làm ảnh bìa.</p>';
  return `<div class="cims">${S.cimgs.map((m, i) => `<div class="cim"><img src="${esc(m.url)}" alt="Ảnh ${i + 1}"><div class="cimb"><span class="mut" style="font-size:12px">${i ? 'Ảnh ' + (i + 1) : 'Ảnh bìa (ảnh đầu tiên)'}</span><textarea data-cap="${i}" rows="2" maxlength="300" placeholder="Mô tả cho ảnh này (ví dụ: phối áo khoác bomber với quần jean)">${esc(m.caption || '')}</textarea><div class="row"><button type="button" class="btn o s" data-a="cimup" data-p="${i}"${i ? '' : ' disabled'} aria-label="Đưa lên">↑</button><button type="button" class="btn o s" data-a="cimdn" data-p="${i}"${i < S.cimgs.length - 1 ? '' : ' disabled'} aria-label="Đưa xuống">↓</button><button type="button" class="btn d s" data-a="cimdel" data-p="${i}">Xóa ảnh</button></div></div></div>`).join('')}</div>`;
}
let colFormNote = () => '';

function colForm(c) {
  const d = c || { title: '', cat: CATS[0][0], active: true };
  return `<h3>${c ? 'Sửa' : 'Thêm'} bộ sưu tập</h3><div class="fld"><label for="c_t">Tên bộ sưu tập</label><input id="c_t" value="${esc(d.title)}" maxlength="80"></div><div class="fld"><label for="c_c">Danh mục (sản phẩm hiển thị trong bộ sưu tập)</label><select id="c_c">${CATS.map(x => `<option value="${x[0]}"${d.cat === x[0] ? ' selected' : ''}>${x[1]}</option>`).join('')}</select></div><div class="fld"><label>Ảnh minh họa và mô tả cho từng ảnh (tối đa 12 ảnh)</label>${colFormNote()}<div id="c_imgs">${colImgsHtml()}</div><input id="c_f" type="file" accept="image/*" multiple><div class="row" style="margin-top:6px;flex-wrap:nowrap"><input id="c_u" placeholder="Hoặc dán đường dẫn ảnh"><button type="button" class="btn s o" data-a="colurl">Thêm</button></div></div><label class="row" style="margin-bottom:10px"><input id="c_a" type="checkbox" style="width:auto"${d.active ? ' checked' : ''}> Hiển thị trên trang chủ</label><div class="err" id="c_e"></div><div class="row"><button class="btn" data-a="colsv">Lưu</button><button class="btn o" data-a="mclose">Hủy</button></div>`;
}

function renderColImgs() {
  const e = $('#c_imgs');
  if (e) e.innerHTML = colImgsHtml();
}

async function addColFiles(files) {
  const room = 12 - S.cimgs.length;
  if (room <= 0) return toast('Tối đa 12 ảnh cho mỗi bộ sưu tập');
  syncCaps();
  toast('Đang xử lý ảnh…');
  for (const f of files.slice(0, room)) {
    try {
      S.cimgs.push({ url: await storeImage(await fileToDataUrl(f, 1200)), caption: '' });
      renderColImgs();
    } catch (e) {
      toast(e.message);
    }
  }
}

function pform(p) {
  const n = !p;
  p = p || {
    name: '',
    price: '',
    sale: '',
    cat: 'ao',
    desc: '',
    sizes: ['S', 'M', 'L'],
    colors: ['Đen', 'Trắng'],
    stock: {}
  };
  return `<h3>${n ? 'Thêm' : 'Sửa'} sản phẩm</h3><div class="fld"><label>Tên</label><input id="m_n" value="${esc(p.name)}"></div><div class="f2"><div class="fld"><label>Giá (₫)</label><input id="m_p" type="number" value="${p.price}"></div><div class="fld"><label>Giá khuyến mãi (₫)</label><input id="m_s" type="number" value="${p.sale || ''}"></div></div><div class="fld"><label>Danh mục</label><select id="m_c">${CATS.map(c => `<option value="${c[0]}"${p.cat === c[0] ? ' selected' : ''}>${c[1]}</option>`).join('')}</select></div><div class="fld"><label>Mô tả</label><textarea id="m_d" rows="2">${esc(p.desc)}</textarea></div><div class="f2"><div class="fld"><label>Size (cách nhau dấu phẩy)</label><input id="m_z" value="${p.sizes.join(',')}"></div><div class="fld"><label>Màu (Đen, Trắng, Xám)</label><input id="m_l" value="${p.colors.join(',')}"></div></div><div class="fld"><label>Tồn kho mỗi biến thể (biến thể mới)</label><input id="m_k" type="number" value="10"></div>${imgFld()}<div class="err" id="merr"></div><div class="row"><button class="btn" data-a="psv" data-p="${n ? 0 : p.id}">Lưu</button><button class="btn o" data-a="mclose">Hủy</button></div>`;
}

function pimgsHtml() {
  return S.pimgs.length
    ? `<div class="pimgs">${S.pimgs.map((u, i) => `<div class="pi"><img src="${esc(u)}" alt="Ảnh ${i + 1}"><button type="button" class="px" data-a="pidel" data-p="${i}" aria-label="Xóa ảnh ${i + 1}">✕</button><button type="button" class="btn s o" data-a="pimain" data-p="${i}"${i ? '' : ' disabled'}>${i ? 'Chọn làm chính' : 'Ảnh chính'}</button></div>`).join('')}</div>`
    : '<p class="mut" style="margin:4px 0">Chưa có ảnh, sản phẩm dùng ảnh minh họa.</p>';
}

function imgFld() {
  return `<div class="fld"><label>Hình ảnh sản phẩm (ảnh đầu tiên là ảnh chính, tối đa 8)</label><div id="m_imgs">${pimgsHtml()}</div><input id="m_f" type="file" accept="image/*" multiple><div class="row" style="margin-top:6px;flex-wrap:nowrap"><input id="m_u" placeholder="Hoặc dán đường dẫn ảnh: https://… hoặc images/ten.jpg"><button type="button" class="btn s o" data-a="piurl">Thêm</button></div></div>`;
}

function renderPImgs() {
  const e = $('#m_imgs');
  if (e) e.innerHTML = pimgsHtml();
}

async function addFiles(files) {
  const room = 8 - S.pimgs.length;
  if (room <= 0) return toast('Tối đa 8 ảnh cho mỗi sản phẩm');
  toast('Đang xử lý ảnh…');
  for (const f of files.slice(0, room)) {
    try {
      S.pimgs.push(await storeImage(await fileToDataUrl(f)));
      renderPImgs();
    } catch (e) {
      toast(e.message);
    }
  }
  if (files.length > room) toast('Chỉ thêm được ' + room + ' ảnh nữa');
}

function setStatus(o, s) {
  if (s === 5 && o.status !== 5)
    o.items.forEach(i => {
      const p = P(i.pid);
      if (p && p.stock[i.size + '|' + i.color] != null) {
        p.stock[i.size + '|' + i.color] += i.qty;
        p.sold = Math.max(0, p.sold - i.qty);
      }
    });
  o.status = s;
  if (s === 4) o.doneAt = Date.now();
  save();
}

/* ==========================================================================
  12. TÌM KIẾM, GỢI Ý & HEADER
   ========================================================================== */

const resetF = () => ({
  q: '',
  cat: '',
  sort: 'new',
  size: '',
  color: '',
  stock: false,
  min: '',
  max: '',
  page: 1
});

let sgi = -1;

function doSearch(q) {
  S.f = { ...resetF(), q };
  hideSug();
  go('products');
}

function hideSug() {
  $('#sug').hidden = true;
  $('#hs').setAttribute('aria-expanded', 'false');
  sgi = -1;
}

function renderSug() {
  const q = $('#hs').value.trim(),
    box = $('#sug');
  if (!q) return hideSug();
  const nq = norm(q),
    starts = db.products.filter(p =>
      norm(p.name)
        .split(' ')
        .some(w => w.startsWith(nq))
    ),
    cont = db.products.filter(p => !starts.includes(p) && norm(p.name).includes(nq)),
    pr = [...starts, ...cont].slice(0, 6),
    cs = CATS.filter(c =>
      norm(c[1])
        .split(' ')
        .some(w => w.startsWith(nq))
    );
  const hl = n => {
    const i = norm(n).indexOf(nq);
    return i < 0
      ? esc(n)
      : esc(n.slice(0, i)) +
          '<mark>' +
          esc(n.slice(i, i + q.length)) +
          '</mark>' +
          esc(n.slice(i + q.length));
  };
  box.innerHTML =
    (cs.length
      ? '<div class="sg-h">Danh mục</div>' +
        cs
          .map(
            c =>
              `<div class="sg" role="option" data-a="sgcat" data-p="${c[0]}">Tất cả ${c[1]} <span class="mut">(${db.products.filter(p => p.cat === c[0]).length})</span></div>`
          )
          .join('')
      : '') +
    (pr.length
      ? '<div class="sg-h">Sản phẩm</div>' +
        pr
          .map(
            p =>
              `<div class="sg" role="option" data-a="sgp" data-p="${p.id}"><img src="${img(p)}" alt=""><div><div>${hl(p.name)}</div><div class="mut" style="font-size:13px">${vnd(pp(p))}</div></div></div>`
          )
          .join('')
      : '') +
    (pr.length || cs.length
      ? `<div class="sg all" role="option" data-a="sgall">Xem tất cả kết quả cho “${esc(q)}”</div>`
      : `<div class="sg-h">Không có gợi ý cho “${esc(q)}”</div>`);
  box.hidden = false;
  $('#hs').setAttribute('aria-expanded', 'true');
  sgi = -1;
}

function setNav() {
  const k =
    S.view === 'home' || S.view === 'col'
      ? 'home'
      : S.view === 'products'
        ? S.f.cat === 'sale'
          ? 'sale'
          : 'products'
        : S.view === 'detail'
          ? 'products'
          : S.view === 'orders'
            ? 'orders'
            : '';
  document.querySelectorAll('[data-nav]').forEach(e => e.classList.toggle('on', e.dataset.nav === k));
}

function setAvatar() {
  const u = user(),
    b = $('#av');
  if (u) {
    const w = u.name.trim().split(/\s+/),
      h = [...u.email].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    b.textContent = (w[w.length - 1][0] || '?').toUpperCase();
    b.style.background = `hsl(${h} 45% 38%)`;
    b.title = u.name;
    b.parentElement.setAttribute('aria-label', 'Tài khoản: ' + u.name);
  } else {
    b.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>';
    b.style.background = '';
    b.title = 'Đăng nhập';
    b.parentElement.setAttribute('aria-label', 'Đăng nhập');
  }
}

/* ==========================================================================
  13. ĐIỀU HƯỚNG & VẼ TRANG
   ========================================================================== */

function go(v, a = null) {
  S.view = v;
  S.arg = a;
  if (v !== 'auth') S.after = null;
  S.sel = {};
  S.img = 0;
  S.open = null;
  $('#nav').classList.remove('open');
  render();
  scrollTo(0, 0);
}

let lastViewKey = '';
function animateView() {
  const k = S.view + (S.view === 'admin' ? ':' + S.adm : '') + (S.view === 'detail' || S.view === 'auth' || S.view === 'col' ? ':' + S.arg : '');
  if (k === lastViewKey) return;
  lastViewKey = k;
  const m = $('#main');
  m.classList.remove('anim-in');
  void m.offsetWidth;
  m.classList.add('anim-in');
}

function render() {
  const V = {
    home,
    products,
    detail,
    cart: cartV,
    checkout,
    auth: authV,
    profile,
    orders: ordersV,
    wish: wishV,
    admin,
    col: colView
  };
  if (['profile', 'orders', 'checkout'].includes(S.view) && !user()) {
    S.after = S.view;
    S.view = 'auth';
    S.arg = 'login';
  }
  $('#main').innerHTML = (V[S.view] || home)();
  animateView();
  const n = cart().reduce((s, i) => s + i.qty, 0),
    c = $('#cc');
  c.hidden = !n;
  c.textContent = n;
  const t = {
    home: 'MONO — Thời trang tối giản',
    products: 'Sản phẩm — MONO',
    cart: 'Giỏ hàng — MONO',
    checkout: 'Thanh toán — MONO',
    admin: 'Quản trị — MONO'
  };
  document.title = S.view === 'detail' && P(S.arg) ? P(S.arg).name + ' — MONO' : t[S.view] || 'MONO';
  setNav();
  setAvatar();
  if (S.view === 'home') startCar();
}

/* ==========================================================================
  14. XỬ LÝ SỰ KIỆN (nút bấm, form, bàn phím)
   ========================================================================== */

const A = {};

// --- Điều hướng & bộ lọc ---
Object.assign(A, {
  go: p => {
    const [v, a] = p.split(':');
    go(v, a);
  },
  menu: () => $('#nav').classList.toggle('open'),
  side: () => $('#side').classList.toggle('open'),
  allp: () => {
    S.f = resetF();
    go('products');
  },
  sale: () => {
    S.f = { ...resetF(), cat: 'sale' };
    go('products');
  },
  cat: p => {
    S.f = { ...resetF(), cat: p };
    go('products');
  },
  acct: () => (user() ? go('profile') : go('auth', 'login')),
  newcol: () => document.getElementById('newcol').scrollIntoView({ behavior: 'smooth' }),
  fs: p => {
    const [k, v] = p.split(':');
    S.f[k] = S.f[k] === v ? '' : v;
    S.f.page = 1;
    render();
  },
  reset: () => {
    S.f = { q: '', cat: '', sort: 'new', size: '', color: '', stock: false, min: '', max: '', page: 1 };
    render();
  },
  pg: p => {
    S.f.page = +p;
    render();
    scrollTo(0, 0);
  }
});

// --- Tìm kiếm ---
Object.assign(A, {
  sgp: p => {
    $('#hs').value = '';
    hideSug();
    go('detail', p);
  },
  sgcat: p => {
    $('#hs').value = '';
    hideSug();
    S.f = { ...resetF(), cat: p };
    go('products');
  },
  sgall: () => doSearch($('#hs').value.trim())
});

// --- Băng chuyền ---
Object.assign(A, {
  cgo: p => {
    carGo(ci + +p);
    restartCar();
  },
  cto: p => {
    carGo(+p);
    restartCar();
  }
});

// --- Sản phẩm & yêu thích ---
Object.assign(A, {
  gi: p => {
    S.img = +p;
    render();
  },
  sel: p => {
    const [k, v] = p.split(':');
    S.sel[k] = v;
    render();
  },
  qty: p => {
    S.sel.qty = Math.max(1, (S.sel.qty || 1) + +p);
    render();
  },
  wish: p => {
    const k = key(),
      l = db.wish[k] || (db.wish[k] = []),
      i = l.indexOf(+p);
    i < 0 ? l.push(+p) : l.splice(i, 1);
    save();
    toast(i < 0 ? 'Đã thêm vào yêu thích' : 'Đã bỏ yêu thích');
    render();
  },
  quick: p => {
    const pr = P(p),
      k = Object.keys(pr.stock).find(k => pr.stock[k] > 0);
    if (!k) return toast('Sản phẩm đã hết hàng');
    const [size, color] = k.split('|');
    addItem(pr.id, size, color, 1);
  },
  add: p => {
    const pr = P(S.arg),
      s = S.sel,
      e = $('#serr');
    if (!s.size || !s.color) {
      e.textContent = 'Vui lòng chọn ' + (!s.color ? 'màu sắc' : 'size') + ' trước khi thêm vào giỏ.';
      return;
    }
    if (addItem(pr.id, s.size, s.color, s.qty || 1) && p === '1') go('checkout');
  },
  rvstar: p => {
    S.rv.r = +p;
    document.querySelectorAll('.rvs').forEach((b, i) => {
      b.classList.toggle('on', i < +p);
      b.setAttribute('aria-checked', i + 1 === +p);
    });
  },
  rvsend: async () => {
    const pr = P(S.arg),
      r = S.rv && S.rv.r,
      c = $('#rv_c').value.trim(),
      e = $('#rv_e');
    if (!r) return (e.textContent = 'Vui lòng chọn số sao');
    if (c.length < 5) return (e.textContent = 'Nhận xét tối thiểu 5 ký tự');
    try {
      await reviewSave(pr.id, r, c);
      S.rv = null;
      render();
      toast('Cảm ơn bạn đã đánh giá!');
    } catch (x) {
      e.textContent = x.message;
    }
  },
  rvgo: p => {
    go('detail', p);
    setTimeout(() => {
      const e = $('#rvform');
      if (e) e.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }
});

// --- Giỏ hàng & thanh toán ---
Object.assign(A, {
  cq: p => {
    const [i, d] = p.split(':'),
      it = cart()[i],
      pr = P(it.pid),
      mx = pr.stock[it.size + '|' + it.color] || 0,
      q = it.qty + +d;
    if (q < 1) return;
    if (q > mx) return toast('Chỉ còn ' + mx + ' sản phẩm trong kho');
    it.qty = q;
    save();
    render();
  },
  cdel: p => {
    cart().splice(+p, 1);
    save();
    render();
    toast('Đã xóa khỏi giỏ hàng');
  },
  checkout: () => go('checkout'),
  ship: p => {
    S.fast = p === '1';
    keepCo();
    render();
  },
  place: () => placeOrder()
});

// --- Tài khoản & đơn hàng ---
Object.assign(A, {
  eye: (p, t) => {
    const i = t.previousElementSibling,
      show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    t.innerHTML = show ? EYE_OFF : EYE;
    t.setAttribute('aria-pressed', show);
    t.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  },
  login: async () => {
    const e = $('#a_e').value.trim().toLowerCase(),
      h = await sha($('#a_p').value),
      u = db.users.find(u => u.email === e && u.pw === h);
    if (!u) return ($('#aerr').textContent = 'Sai email hoặc mật khẩu');
    if (!u.ok) return ($('#aerr').textContent = 'Tài khoản đã bị khóa');
    loginAs(u);
  },
  reg: async () => {
    const n = $('#a_n').value.trim(),
      e = $('#a_e').value.trim().toLowerCase(),
      p = $('#a_p').value,
      er = $('#aerr');
    if (n.length < 2) return (er.textContent = 'Vui lòng nhập họ tên');
    if (!/^\S+@\S+\.\S+$/.test(e)) return (er.textContent = 'Email không hợp lệ');
    if (p.length < 8) return (er.textContent = 'Mật khẩu tối thiểu 8 ký tự');
    if (db.users.some(u => u.email === e)) return (er.textContent = 'Email đã được đăng ký');
    const u = {
      id: Date.now(),
      email: e,
      name: n,
      phone: '',
      role: 'user',
      ok: true,
      pw: await sha(p),
      date: Date.now()
    };
    db.users.push(u);
    loginAs(u);
  },
  logout: () => {
    db.session = null;
    save();
    go('home');
    toast('Đã đăng xuất');
  },
  psave: () => {
    const n = $('#pf_n').value.trim(),
      p = $('#pf_p').value.trim();
    if (n.length < 2) return ($('#perr').textContent = 'Họ tên quá ngắn');
    if (p && !/^0\d{9}$/.test(p)) return ($('#perr').textContent = 'Số điện thoại không hợp lệ');
    Object.assign(user(), { name: n, phone: p });
    save();
    toast('Đã cập nhật thông tin');
  },
  pwsave: async () => {
    const u = user(),
      n = $('#pw_n').value;
    if ((await sha($('#pw_o').value)) !== u.pw)
      return ($('#werr').textContent = 'Mật khẩu hiện tại không đúng');
    if (n.length < 8) return ($('#werr').textContent = 'Mật khẩu mới tối thiểu 8 ký tự');
    u.pw = await sha(n);
    save();
    toast('Đã đổi mật khẩu');
    render();
  },
  oopen: p => {
    S.open = S.open === p ? null : p;
    render();
  },
  ocancel: p => {
    if (!confirm('Hủy đơn ' + p + '?')) return;
    const o = db.orders.find(o => o.id === p);
    if (o.status !== 0) return toast('Chỉ hủy được đơn chờ xác nhận');
    setStatus(o, 5);
    toast('Đã hủy đơn');
    render();
  }
});

// --- Quản trị & ảnh sản phẩm ---
Object.assign(A, {
  atab: p => {
    S.adm = p;
    S.aq = '';
    S.as = '';
    S.open = null;
    render();
  },
  pedit: p => {
    const pr = +p ? P(p) : null;
    S.pimgs = pr && pr.images ? [...pr.images] : [];
    modal(pform(pr));
  },
  mclose: (p, t, e) => {
    if (t.classList.contains('ov') && e.target !== t) return;
    modal('');
  },
  psv: p => {
    const g = i => $('#' + i).value.trim(),
      er = $('#merr'),
      price = +g('m_p'),
      sale = +g('m_s') || 0,
      sizes = g('m_z')
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean),
      colors = g('m_l')
        .split(',')
        .map(s => s.trim())
        .filter(c => COLS[c]);
    if (g('m_n').length < 2) return (er.textContent = 'Vui lòng nhập tên sản phẩm');
    if (!(price > 0)) return (er.textContent = 'Giá phải lớn hơn 0');
    if (sale && sale >= price) return (er.textContent = 'Giá khuyến mãi phải thấp hơn giá gốc');
    if (!sizes.length || !colors.length)
      return (er.textContent = 'Cần ít nhất 1 size và 1 màu hợp lệ (Đen, Trắng, Xám)');
    const old = +p ? P(p) : null,
      stock = {};
    sizes.forEach(s =>
      colors.forEach(
        c =>
          (stock[s + '|' + c] =
            old && old.stock[s + '|' + c] != null ? old.stock[s + '|' + c] : Math.max(0, +g('m_k') || 0))
      )
    );
    const d = {
      name: g('m_n'),
      slug: slug(g('m_n')),
      price,
      sale,
      cat: g('m_c'),
      desc: g('m_d'),
      sizes,
      colors,
      stock,
      images: [...(S.pimgs || [])]
    };
    if (old) Object.assign(old, d);
    else {
      const id = Math.max(0, ...db.products.map(x => x.id)) + 1;
      db.products.push({ id, sold: 0, mat: 'Cotton 100%', date: Date.now(), ...d });
    }
    save();
    modal('');
    render();
    toast('Đã lưu sản phẩm');
  },
  pdel: p => {
    if (!confirm('Xóa sản phẩm này? Hành động không thể hoàn tác.')) return;
    db.products = db.products.filter(x => x.id !== +p);
    save();
    render();
    toast('Đã xóa sản phẩm');
  },
  lock: p => {
    const u = db.users.find(u => u.id == p);
    u.ok = !u.ok;
    save();
    render();
    toast(u.ok ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản');
  },
  complete: p => {
    const o = db.orders.find(o => o.id === p);
    if (!o || o.status >= 4) return;
    if (!confirm('Đánh dấu đơn ' + p + ' đã hoàn thành? Doanh thu sẽ được cập nhật.')) return;
    setStatus(o, 4);
    render();
    toast('Đã hoàn thành đơn ' + p + ', doanh thu +' + vnd(o.total));
  },
  pidel: p => {
    S.pimgs.splice(+p, 1);
    renderPImgs();
  },
  pimain: p => {
    const [x] = S.pimgs.splice(+p, 1);
    S.pimgs.unshift(x);
    renderPImgs();
  },
  piurl: () => {
    const i = $('#m_u'),
      u = i.value.trim();
    if (!/^(https?:\/\/|\/?images\/|\/uploads\/|\/api\/uploads\/)\S+$/.test(u)) return toast('Đường dẫn ảnh không hợp lệ');
    if (S.pimgs.length >= 8) return toast('Tối đa 8 ảnh');
    S.pimgs.push(u);
    i.value = '';
    renderPImgs();
  },
  coledit: p => {
    const c = +p ? getCols().find(x => x.id == p) : null;
    S.cid = c ? c.id : 0;
    S.cimgs = c ? colPics(c).map(m => ({ url: m.url, caption: m.caption || '' })) : [];
    modal(colForm(c));
  },
  colsv: async () => {
    const t = $('#c_t').value.trim(),
      e = $('#c_e');
    if (t.length < 2) return (e.textContent = 'Vui lòng nhập tên bộ sưu tập');
    syncCaps();
    const images = S.cimgs.filter(m => m.url).map(m => ({ url: m.url, caption: m.caption || '' }));
    try {
      await colSave(S.cid, { title: t, cat: $('#c_c').value, image: images[0] ? images[0].url : '', images, active: $('#c_a').checked });
      modal('');
      render();
      toast('Đã lưu bộ sưu tập');
    } catch (x) {
      e.textContent = x.message;
    }
  },
  colup: async p => {
    try {
      await colMove(p, -1);
      render();
    } catch (e) {
      toast(e.message);
    }
  },
  coldown: async p => {
    try {
      await colMove(p, 1);
      render();
    } catch (e) {
      toast(e.message);
    }
  },
  coltog: async p => {
    const c = getCols().find(x => x.id == p);
    try {
      await colSave(c.id, { title: c.title, cat: c.cat, image: c.image, images: c.images || [], active: !c.active });
      render();
    } catch (e) {
      toast(e.message);
    }
  },
  coldel: async p => {
    if (!confirm('Xóa bộ sưu tập này?')) return;
    try {
      await colRemove(p);
      render();
      toast('Đã xóa bộ sưu tập');
    } catch (e) {
      toast(e.message);
    }
  },
  colurl: () => {
    const i = $('#c_u'),
      u = i.value.trim();
    if (!/^(https?:\/\/|\/?images\/|\/uploads\/|\/api\/uploads\/)\S+$/.test(u)) return toast('Đường dẫn ảnh không hợp lệ');
    if (S.cimgs.length >= 12) return toast('Tối đa 12 ảnh cho mỗi bộ sưu tập');
    syncCaps();
    S.cimgs.push({ url: u, caption: '' });
    i.value = '';
    renderColImgs();
  },
  cimup: p => {
    syncCaps();
    const i = +p;
    if (i > 0) [S.cimgs[i - 1], S.cimgs[i]] = [S.cimgs[i], S.cimgs[i - 1]];
    renderColImgs();
  },
  cimdn: p => {
    syncCaps();
    const i = +p;
    if (i < S.cimgs.length - 1) [S.cimgs[i + 1], S.cimgs[i]] = [S.cimgs[i], S.cimgs[i + 1]];
    renderColImgs();
  },
  cimdel: p => {
    syncCaps();
    S.cimgs.splice(+p, 1);
    renderColImgs();
  },
  colv: p => go('col', p),
  lbopen: p => {
    const c = getCols().find(x => x.id == S.arg);
    S.lb = +p;
    modal(lbHtml(c, S.lb));
  },
  lbgo: p => {
    const c = getCols().find(x => x.id == S.arg),
      n = colPics(c).length;
    S.lb = (S.lb + +p + n) % n;
    modal(lbHtml(c, S.lb));
  },
  coldef: async () => {
    try {
      for (const s of CONFIG.slides)
        await colSave(0, { title: s.title, cat: s.cat, image: s.image || '', active: true });
      render();
      toast('Đã nhập bộ sưu tập mặc định');
    } catch (e) {
      toast(e.message);
    }
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.sbox')) hideSug();
  const t = e.target.closest('[data-a]');
  if (!t) return;
  if (t.tagName === 'INPUT' && t.type === 'radio' && e.target !== t) return;
  const f = A[t.dataset.a];
  if (f) f(t.dataset.p || '', t, e);
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'm_f') {
    addFiles([...t.files]);
    t.value = '';
    return;
  }
  if (t.id === 'c_f') {
    addColFiles([...t.files]);
    t.value = '';
    return;
  }
  if (t.dataset.f) {
    const k = t.dataset.f;
    if (k === 'aq' || k === 'as' || k === 'cq') {
      S[k] = t.value;
    } else {
      S.f[k] = t.type === 'checkbox' ? t.checked : t.value;
      S.f.page = 1;
    }
    render();
  }
  if (t.dataset.ost) {
    const o = db.orders.find(o => o.id === t.dataset.ost);
    if (t.value !== '') {
      Promise.resolve(setStatus(o, +t.value)).then(ok => {
        if (ok !== false) {
          toast('Đã cập nhật trạng thái đơn');
          render();
        }
      });
    }
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#modal').firstChild) return modal('');
  if (e.target.id === 'hs') {
    const it = [...document.querySelectorAll('#sug .sg')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!it.length) return;
      e.preventDefault();
      sgi = e.key === 'ArrowDown' ? (sgi + 1) % it.length : sgi <= 0 ? it.length - 1 : sgi - 1;
      it.forEach((x, i) => x.classList.toggle('act', i === sgi));
      it[sgi].scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Escape') return hideSug();
    if (e.key === 'Enter') {
      sgi >= 0 && it[sgi] ? it[sgi].click() : doSearch(e.target.value.trim());
    }
    return;
  }
  if (e.key === 'Enter' && e.target.matches('[data-a][tabindex]')) e.target.click();
});

$('#hs').addEventListener('input', renderSug);

$('#hs').addEventListener('focus', renderSug);

/* ==========================================================================
  15. KHỞI ĐỘNG
   ========================================================================== */

addEventListener('DOMContentLoaded', () =>
  (window.MONO_BOOT || init)()
    .then(render)
    .catch(e => {
      $('#main').innerHTML = '<div class="empty">Không thể khởi tạo dữ liệu: ' + esc(e.message) + '</div>';
    })
);