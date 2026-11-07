/* ==========================================================================
   NSHV — pages.js: Trang Câu hỏi thường gặp (FAQ), Đặt lịch Stylist, liên hệ ở footer
   - Đặt lịch lưu thành lịch hẹn riêng (bảng Booking); admin lọc và xác nhận ở tab "Đặt lịch" trong trang quản trị.
   - Thông tin liên hệ chỉ cần sửa MỘT chỗ: đối tượng CONTACT bên dưới.
   Phụ thuộc: app.js (S, esc, user, go, toast, chatSend) và api.js (window.MONO_TRYON.online).
   ========================================================================== */
(function () {
  /* ---------- Cấu hình: sửa tại đây ---------- */
  const CONTACT = {
    phone: '1900 0000',
    email: 'buichaunamthai128208@gmail.com',
    facebook: 'https://www.facebook.com/buichaunamthai128208', // TODO: thay bằng link fanpage thật của cửa hàng
    instagram: 'https://www.instagram.com/' // TODO: thay bằng link Instagram thật của cửa hàng
  };
  const OPEN = '08:00', CLOSE = '22:00'; // khách tự chọn giờ hẹn trong khoảng này (server cũng kiểm tra lại)
  const MODES = ['Gặp tại cửa hàng', 'Tư vấn qua điện thoại', 'Tư vấn qua chat'];
  const TOPICS = ['Phối đồ đi làm', 'Phối đồ đi chơi hằng ngày', 'Phối đồ dự tiệc / sự kiện', 'Xây dựng tủ đồ cơ bản', 'Mua sắm theo ngân sách', 'Khác'];
  const MAX_DAYS_AHEAD = 60;

  const telHref = p => 'tel:' + String(p).replace(/[^\d+]/g, '');
  const fold = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dmy = s => s.split('-').reverse().join('/');
  const live = () => !!(window.MONO_TRYON && window.MONO_TRYON.online);
  const link = (label, act, arg) => `<button type="button" class="lk" data-a="${act}"${arg ? ` data-p="${arg}"` : ''}>${label}</button>`;
  const ext = (label, href) => `<a class="lk" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;

  /* ==========================================================================
     FOOTER: mục liên hệ bấm được (gọi điện, gửi mail, mở Facebook / Instagram, chat)
     ========================================================================== */
  function paintFooter() {
    const ul = document.getElementById('ftc');
    if (!ul) return;
    ul.innerHTML =
      `<li>Hotline: <a class="lk" href="${esc(telHref(CONTACT.phone))}">${esc(CONTACT.phone)}</a></li>` +
      `<li>Email: <a class="lk" href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a></li>` +
      `<li>${ext('Facebook', CONTACT.facebook)} · ${ext('Instagram', CONTACT.instagram)}</li>` +
      `<li>${link('Chat với cửa hàng', 'chat')}</li>`;
  }

  /* ==========================================================================
     FAQ — nội dung dựa trên hành vi thật của hệ thống (đơn hàng, mã giảm giá, tài khoản, thử đồ AI...)
     ========================================================================== */
  const faqData = () => [
    {
      id: 'dat-hang', title: 'Đặt hàng & thanh toán', items: [
        { id: 'cach-dat', q: 'Làm sao để đặt hàng?', a: 'Mở sản phẩm, chọn size và màu rồi bấm <b>Thêm vào giỏ</b>. Vào <b>Giỏ hàng</b>, bấm thanh toán, nhập thông tin người nhận và địa chỉ giao hàng, sau đó xác nhận đơn. Bạn cần đăng nhập để thanh toán.' },
        { id: 'thanh-toan', q: 'Cửa hàng hỗ trợ những hình thức thanh toán nào?', a: 'Hiện tại cửa hàng áp dụng <b>thanh toán khi nhận hàng (COD)</b>: bạn trả tiền cho nhân viên giao hàng.' },
        { id: 'phi-ship', q: 'Phí giao hàng là bao nhiêu?', a: 'Phí giao hàng là <b>30.000₫</b>. Đơn có tổng tiền hàng từ <b>500.000₫</b> trở lên được <b>miễn phí giao hàng</b> (tính trên tiền hàng, trước khi trừ mã giảm giá).' },
        { id: 'ma-giam-gia', q: 'Dùng mã giảm giá như thế nào?', a: 'Nhập mã ở bước Giỏ hàng / Thanh toán rồi áp dụng. Mỗi mã có điều kiện riêng (thời gian áp dụng, giá trị đơn tối thiểu, số lượt dùng) nên có thể không dùng được cho mọi đơn.' },
        { id: 'loi-ma', q: 'Mã giảm giá báo lỗi, tôi phải làm gì?', a: 'Thông báo cho biết lý do cụ thể:<ul><li><b>Mã giảm giá không tồn tại</b>: kiểm tra lại chính tả, chú ý chữ hoa/thường và khoảng trắng.</li><li><b>Đã bị tắt / chưa đến thời gian áp dụng / đã hết hạn</b>: mã chưa hoặc không còn hiệu lực.</li><li><b>Đã hết lượt sử dụng</b>: mã đã được dùng hết số lượt chung.</li><li><b>Đơn hàng tối thiểu …</b>: thêm sản phẩm để đủ giá trị tối thiểu.</li><li><b>Bạn đã dùng hết lượt của mã này</b>: mỗi tài khoản chỉ dùng được số lần quy định.</li></ul>' },
        { id: 'het-hang', q: 'Báo “không đủ hàng” hoặc “Chỉ còn N sản phẩm trong kho” là sao?', a: 'Tồn kho được tính riêng cho từng size và màu. Hãy giảm số lượng xuống bằng số còn lại, hoặc chọn size/màu khác của sản phẩm đó. Có thể sản phẩm vừa được người khác mua.' },
        { id: 'don-da-tao', q: 'Báo “Giỏ hàng trống hoặc đơn đã được tạo”?', a: 'Thường do bấm xác nhận đặt hàng hai lần, hoặc giỏ đã được đặt thành đơn. Hãy mở mục <b>Đơn hàng</b> để kiểm tra trước khi đặt lại.' }
      ]
    },
    {
      id: 'don-hang', title: 'Đơn hàng & đổi trả', items: [
        { id: 'theo-doi', q: 'Tôi theo dõi đơn hàng ở đâu?', a: 'Vào mục <b>Đơn hàng</b> trên thanh điều hướng. Đơn đi qua các trạng thái: Chờ xác nhận → Đã xác nhận → Đang chuẩn bị → Đang giao → Đã giao (hoặc Đã hủy).' },
        { id: 'huy-don', q: 'Tôi có thể hủy đơn không?', a: 'Bạn tự hủy được khi đơn còn ở trạng thái <b>Chờ xác nhận</b> (nút <b>Hủy đơn</b> trong mục Đơn hàng). Sau khi cửa hàng đã xác nhận, hệ thống sẽ báo “Chỉ hủy được đơn đang chờ xác nhận” — khi đó hãy liên hệ cửa hàng qua chat hoặc hotline kèm mã đơn.' },
        { id: 'doi-tra', q: 'Chính sách đổi trả như thế nào?', a: 'Cửa hàng hỗ trợ <b>đổi trả trong 7 ngày</b>. Để được hướng dẫn chi tiết, hãy nhắn qua chat hoặc gọi hotline kèm <b>mã đơn</b> (dạng DH…, xem trong mục Đơn hàng).' }
      ]
    },
    {
      id: 'tai-khoan', title: 'Tài khoản & bảo mật', items: [
        { id: 'dang-ky', q: 'Đăng ký tài khoản cần những gì?', a: 'Họ tên (từ 2 ký tự), email hợp lệ và mật khẩu từ <b>8 ký tự</b>. Số điện thoại không bắt buộc, nếu nhập phải gồm 10 số và bắt đầu bằng 0. Báo “Email đã được đăng ký” nghĩa là email đó đã có tài khoản: hãy đăng nhập hoặc dùng email khác.' },
        { id: 'khong-dang-nhap', q: 'Tôi không đăng nhập được?', a: '<ul><li><b>Sai email hoặc mật khẩu</b>: kiểm tra lại, chú ý phím Caps Lock.</li><li><b>Tài khoản đã bị khóa</b>: hãy liên hệ cửa hàng để được hỗ trợ.</li><li><b>Chưa đăng nhập / Phiên đăng nhập không hợp lệ</b>: phiên đã hết hạn, chỉ cần đăng nhập lại.</li></ul>' },
        { id: 'quen-mat-khau', q: 'Tôi quên mật khẩu thì sao?', a: 'Hiện website chưa có chức năng tự đặt lại mật khẩu. Vui lòng liên hệ cửa hàng qua hotline hoặc email để được hỗ trợ. Khi còn đăng nhập, bạn có thể đổi mật khẩu trong trang <b>Tài khoản</b> (cần nhập đúng mật khẩu hiện tại).' },
        { id: 'bao-mat', q: 'Thông tin của tôi có được bảo mật không?', a: 'Mật khẩu được mã hóa một chiều trước khi lưu nên cửa hàng không xem được mật khẩu của bạn. Thông tin giao hàng (tên, số điện thoại, địa chỉ) dùng để xử lý đơn của bạn. Ảnh thử đồ AI chỉ được gửi khi bạn bấm xác nhận.' }
      ]
    },
    {
      id: 'san-pham', title: 'Sản phẩm & yêu thích', items: [
        { id: 'chon-size', q: 'Báo “Vui lòng chọn size và màu hợp lệ”?', a: 'Hãy chọn đủ <b>size</b> và <b>màu</b> còn hàng trước khi bấm Thêm vào giỏ. Lựa chọn đã hết hàng sẽ không chọn được.' },
        { id: 'san-pham-het', q: 'Sản phẩm hiển thị “Hết hàng”?', a: 'Sản phẩm đã hết ở tất cả size/màu. Hãy quay lại sau hoặc nhắn cửa hàng để được tư vấn sản phẩm tương tự.' },
        { id: 'yeu-thich', q: 'Danh sách yêu thích được lưu ở đâu?', a: 'Danh sách yêu thích được lưu <b>trên trình duyệt bạn đang dùng</b>. Nếu đổi thiết bị hoặc xóa dữ liệu trình duyệt, danh sách sẽ không còn.' },
        { id: 'danh-gia', q: 'Làm sao để đánh giá sản phẩm?', a: 'Nút <b>Đánh giá</b> xuất hiện cạnh sản phẩm trong các đơn ở trạng thái <b>Đã giao</b> (mục Đơn hàng).' }
      ]
    },
    {
      id: 'ai', title: 'Thử đồ AI & Phối đồ thông minh', items: [
        { id: 'thu-do', q: 'Thử đồ AI hoạt động như thế nào?', a: 'Mở sản phẩm và bấm <b>Thử đồ với AI</b> (cần đăng nhập), chọn một ảnh chụp rõ người của bạn (tối đa <b>10 MB</b>), xem lại rồi bấm xác nhận. Ảnh được thu nhỏ và bỏ thông tin vị trí ngay trên trình duyệt trước khi gửi.' },
        { id: 'thu-do-loi', q: 'Thử đồ AI báo lỗi hoặc không dùng được?', a: '<ul><li><b>Chưa bật / máy chủ AI không hoạt động</b>: tính năng đang tạm dừng hoặc bảo trì, hãy thử lại sau.</li><li><b>Thao tác quá nhanh / hết lượt</b>: có giới hạn số lượt thử mỗi ngày và số yêu cầu liên tiếp; mỗi lần chỉ xử lý một lượt, hãy đợi lượt trước hoàn tất.</li><li><b>Không thấy nút Thử đồ</b>: sản phẩm đó chưa hỗ trợ thử đồ AI.</li></ul>' },
        { id: 'phoi-do', q: 'Phối đồ thông minh dùng như thế nào?', a: 'Thêm sản phẩm vào <b>Yêu thích</b>, bấm <b>Phối đồ với sản phẩm này</b>, chọn phong cách (và ngân sách nếu muốn). Hệ thống chỉ gợi ý sản phẩm đang bán và còn hàng của cửa hàng, kèm điểm tương thích và độ tin cậy.' },
        { id: 'phoi-do-rong', q: 'Phối đồ báo chưa tìm được bộ phù hợp?', a: 'Hãy thử bỏ giới hạn ngân sách hoặc đổi phong cách. Kết quả có thể ít khi cửa hàng chưa có đủ loại sản phẩm (ví dụ giày) hoặc thiếu thông tin màu/chất liệu để đánh giá chắc chắn.' }
      ]
    },
    {
      id: 'lien-he', title: 'Stylist & liên hệ', items: [
        { id: 'dat-lich', q: 'Đặt lịch gặp stylist như thế nào?', a: `Chọn mục <b>Đặt lịch Stylist</b> trên thanh điều hướng, đăng nhập, rồi chọn ngày, giờ (từ 08:00 đến 22:00) và nội dung cần tư vấn. Cửa hàng sẽ xác nhận lịch cho bạn. ${link('Đặt lịch ngay', 'go', 'stylist')}` },
        { id: 'lien-he', q: 'Tôi liên hệ cửa hàng bằng cách nào?', a: `Chat với cửa hàng (nút ở góc màn hình, cần đăng nhập), gọi <a class="lk" href="${esc(telHref(CONTACT.phone))}">${esc(CONTACT.phone)}</a> hoặc gửi mail tới <a class="lk" href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a>. Facebook và Instagram có ở cuối trang.` }
      ]
    },
    {
      id: 'loi', title: 'Lỗi thường gặp khi dùng website', items: [
        { id: 'mat-ket-noi', q: 'Trang hiển thị dữ liệu mẫu hoặc không thấy đơn hàng thật?', a: 'Khi không kết nối được máy chủ, trang tự chuyển sang <b>chế độ demo</b> lưu dữ liệu trên trình duyệt. Đơn hàng đặt ở chế độ này <b>không</b> được gửi tới cửa hàng. Hãy kiểm tra mạng, tải lại trang rồi đặt lại; nếu cần, gọi hotline.' },
        { id: 'het-phien', q: 'Báo “Chưa đăng nhập” hoặc “Phiên đăng nhập không hợp lệ”?', a: 'Phiên đăng nhập đã hết hạn. Hãy đăng xuất rồi đăng nhập lại.' },
        { id: 'anh-loi', q: 'Ảnh hoặc giao diện hiển thị lỗi?', a: 'Hãy tải lại trang bằng Ctrl + F5 (hoặc Cmd + Shift + R trên Mac) để xóa bộ nhớ đệm cũ, và thử lại.' },
        { id: 'van-loi', q: 'Tôi vẫn gặp lỗi khác?', a: `Hãy chụp màn hình thông báo lỗi và nhắn cho cửa hàng qua chat hoặc ${link('đặt lịch với stylist', 'go', 'stylist')}, hoặc gọi hotline <a class="lk" href="${esc(telHref(CONTACT.phone))}">${esc(CONTACT.phone)}</a>.` }
      ]
    }
  ];

  function faq() {
    const target = String(S.arg || '');
    if (target) setTimeout(() => {
      const el = document.getElementById('faq-' + target);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    const body = faqData().map(sec => `<section class="faq-sec" id="faq-${sec.id}"><h2>${esc(sec.title)}</h2>${sec.items.map(it =>
      `<details class="faq-i" id="faq-${it.id}" data-t="${esc(fold(it.q + ' ' + it.a.replace(/<[^>]+>/g, ' ')))}"${it.id === target ? ' open' : ''}><summary>${esc(it.q)}</summary><div class="faq-a">${it.a}</div></details>`).join('')}</section>`).join('');
    return `<h1 style="margin-top:20px">Câu hỏi thường gặp</h1>
<p class="mut">Giải đáp nhanh về đặt hàng, đơn hàng, tài khoản và các lỗi thường gặp.</p>
<div class="fld faq-s"><label for="faq_q">Tìm câu hỏi</label><input id="faq_q" type="search" placeholder="Ví dụ: mã giảm giá, hủy đơn, thử đồ" autocomplete="off"></div>
<div id="faq_list">${body}</div>
<div class="empty" id="faq_none" hidden>Không tìm thấy câu hỏi phù hợp. Hãy thử từ khóa khác hoặc liên hệ cửa hàng.</div>
<div class="box faq-help"><b>Chưa tìm được câu trả lời?</b><p class="mut">Nhắn cho cửa hàng hoặc đặt lịch để stylist tư vấn trực tiếp.</p><div class="row">${`<button type="button" class="btn s" data-a="chat">Chat với cửa hàng</button><button type="button" class="btn o s" data-a="go" data-p="stylist">Đặt lịch Stylist</button><a class="btn o s" href="${esc(telHref(CONTACT.phone))}">Gọi ${esc(CONTACT.phone)}</a>`}</div></div>`;
  }

  document.addEventListener('input', e => {
    if (e.target.id !== 'faq_q') return;
    const q = fold(e.target.value.trim());
    let shown = 0;
    document.querySelectorAll('#faq_list .faq-sec').forEach(sec => {
      let n = 0;
      sec.querySelectorAll('.faq-i').forEach(d => {
        const ok = !q || d.dataset.t.includes(q);
        d.hidden = !ok;
        if (ok) n++;
        if (q && ok) d.open = true;
      });
      sec.hidden = n === 0;
      shown += n;
    });
    const none = document.getElementById('faq_none');
    if (none) none.hidden = shown > 0;
  });

  /* ==========================================================================
     ĐẶT LỊCH STYLIST — lưu thành lịch hẹn riêng (POST /api/bookings), admin xác nhận ở tab "Đặt lịch"
     Giờ hẹn khách tự chọn trong khoảng OPEN – CLOSE.
     ========================================================================== */
  const ST = { mode: 0, done: null, busy: false, list: null, loadedAt: 0 };
  const STAT = { PENDING: 'Chờ cửa hàng xác nhận', CONFIRMED: 'Đã xác nhận', CANCELLED: 'Đã hủy' };

  async function loadMine(force) {
    if (!user() || (!force && Date.now() - ST.loadedAt < 8000)) return;
    ST.loadedAt = Date.now();
    try { ST.list = await bkMine(); } catch (e) { ST.list = ST.list || []; }
    repaint();
  }

  function listHtml() {
    const l = (ST.list || []).slice(0, 8);
    if (!l.length) return '';
    return `<div class="box" style="margin-top:16px"><h3>Lịch hẹn của bạn</h3>${l.map(b =>
      `<p class="row" style="justify-content:space-between;margin:6px 0"><span><b>${esc(dmy(b.date))} · ${esc(b.time)}</b><br><span class="mut">${esc(b.mode)} · ${esc(b.topic)}</span></span><span class="row"><span class="badge${b.status === 'CONFIRMED' ? ' c4' : b.status === 'CANCELLED' ? ' c5' : ''}">${esc(STAT[b.status] || b.status)}</span>${b.status === 'PENDING' ? `<button type="button" class="btn o s" data-st="cancel:${b.id}">Hủy</button>` : ''}</span></p>`).join('')}
<p class="mut">Lịch chỉ chính thức khi cửa hàng xác nhận; cửa hàng cũng sẽ nhắn báo trong khung chat. ${link('Mở chat', 'chat')}</p></div>`;
  }

  function formHtml() {
    const u = user() || {};
    const min = new Date(); min.setDate(min.getDate() + 1);
    const max = new Date(); max.setDate(max.getDate() + MAX_DAYS_AHEAD);
    return `<div class="box"><div class="f2"><div class="fld"><label for="st_n">Họ và tên</label><input id="st_n" maxlength="80" value="${esc(u.name || '')}" autocomplete="name"></div>
<div class="fld"><label for="st_p">Số điện thoại</label><input id="st_p" inputmode="tel" maxlength="10" placeholder="0912345678" value="${esc(u.phone || '')}" autocomplete="tel"></div></div>
<div class="fld"><label>Hình thức tư vấn</label><div class="of-chips" data-g="mode">${MODES.map((m, i) => `<button type="button" class="chip${ST.mode === i ? ' on' : ''}" data-st="mode:${i}" aria-pressed="${ST.mode === i}">${esc(m)}</button>`).join('')}</div></div>
<div class="f2"><div class="fld"><label for="st_d">Ngày hẹn</label><input id="st_d" type="date" min="${ymd(min)}" max="${ymd(max)}"></div>
<div class="fld"><label for="st_h">Giờ hẹn (từ ${OPEN} đến ${CLOSE})</label><input id="st_h" type="time" min="${OPEN}" max="${CLOSE}" step="900"></div></div>
<div class="fld"><label for="st_t">Nội dung cần tư vấn</label><select id="st_t">${TOPICS.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
<div class="fld"><label for="st_x">Ghi chú (không bắt buộc)</label><textarea id="st_x" rows="3" maxlength="300" placeholder="Dịp mặc, phong cách yêu thích, ngân sách…"></textarea></div>
<div class="err" id="st_err" role="alert"></div>
<div class="row"><button type="button" class="btn" id="st_go" data-st="submit">Gửi yêu cầu đặt lịch</button></div></div>`;
  }

  function stylistInner() {
    const head = `<h1 style="margin-top:20px">Đặt lịch gặp Stylist</h1><p class="mut">Stylist của NSHV tư vấn phối đồ riêng cho bạn. Chọn ngày và giờ phù hợp (${OPEN} – ${CLOSE}), cửa hàng sẽ xác nhận lịch cho bạn.</p>`;
    if (!user()) {
      return head + `<div class="box"><p>Vui lòng đăng nhập để đặt lịch.</p><div class="row"><button type="button" class="btn" data-st="login">Đăng nhập</button><a class="btn o" href="${esc(telHref(CONTACT.phone))}">Hoặc gọi ${esc(CONTACT.phone)}</a></div></div>`;
    }
    if (ST.done) {
      const b = ST.done;
      return head + `<div class="box" role="status"><h3>Đã gửi yêu cầu đặt lịch</h3><p><b>${esc(dmy(b.date))} · ${esc(b.time)}</b><br>${esc(b.mode)} · ${esc(b.topic)}</p>
${live() ? '<p class="mut">Lịch chỉ chính thức khi cửa hàng xác nhận. Bạn có thể theo dõi trạng thái ở danh sách bên dưới.</p>' : '<p class="err">Bạn đang ở chế độ demo (chưa kết nối máy chủ): yêu cầu chỉ lưu trên trình duyệt này, chưa gửi tới cửa hàng. Vui lòng gọi hotline để đặt lịch.</p>'}
<div class="row"><button type="button" class="btn" data-a="chat">Mở chat</button><button type="button" class="btn o" data-st="again">Đặt lịch khác</button><button type="button" class="btn o" data-a="go" data-p="faq">Câu hỏi thường gặp</button></div></div>` + listHtml();
    }
    return head + formHtml() + listHtml();
  }

  const stylist = () => { loadMine(); return `<div id="stylist">${stylistInner()}</div>`; };
  function repaint() {
    const r = document.getElementById('stylist');
    if (!r) return;
    // Không vẽ lại khi khách đang nhập form (tránh mất chữ đã gõ); danh sách tự cập nhật ở lần mở/đặt lịch tiếp theo
    if (!ST.done && r.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    r.innerHTML = stylistInner();
  }

  async function submit() {
    const $v = id => (document.getElementById(id) || {}).value || '';
    const fail = m => { const e = document.getElementById('st_err'); if (e) e.textContent = m; };
    const name = $v('st_n').trim(), phone = $v('st_p').trim(), date = $v('st_d'), time = $v('st_h'), topic = $v('st_t'), note = $v('st_x').trim();
    if (name.length < 2) return fail('Vui lòng nhập họ tên');
    if (!/^0\d{9}$/.test(phone)) return fail('Số điện thoại gồm 10 số và bắt đầu bằng 0');
    if (!date) return fail('Vui lòng chọn ngày hẹn');
    const d = new Date(date + 'T00:00:00'), min = new Date(), max = new Date();
    min.setHours(0, 0, 0, 0); min.setDate(min.getDate() + 1);
    max.setHours(0, 0, 0, 0); max.setDate(max.getDate() + MAX_DAYS_AHEAD);
    if (isNaN(d) || d < min || d > max) return fail('Ngày hẹn phải từ ngày mai và trong vòng ' + MAX_DAYS_AHEAD + ' ngày tới');
    if (!/^\d{2}:\d{2}$/.test(time)) return fail('Vui lòng chọn giờ hẹn');
    if (time < OPEN || time > CLOSE) return fail('Giờ hẹn phải từ ' + OPEN + ' đến ' + CLOSE);
    if (ST.busy) return;
    const entry = { date, time, mode: MODES[ST.mode], topic };
    ST.busy = true;
    const btn = document.getElementById('st_go');
    if (btn) { btn.disabled = true; btn.textContent = 'Đang gửi…'; }
    fail('');
    try {
      await bkCreate({ name, phone, ...entry, note: note || undefined });
      ST.done = entry;
      ST.busy = false;
      ST.loadedAt = 0;
      try { ST.list = await bkMine(); } catch (e) { }
      repaint();
      scrollTo(0, 0);
    } catch (e) {
      ST.busy = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Gửi yêu cầu đặt lịch'; }
      fail(e && e.status === 429 ? 'Bạn đặt lịch quá nhiều, vui lòng thử lại sau ít phút.'
        : e && e.status === 401 ? 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'
          : e && e.status === 404 ? 'Máy chủ chưa hỗ trợ đặt lịch, vui lòng gọi ' + CONTACT.phone + '.'
            : e && e.message && e.status ? e.message
              : 'Không gửi được yêu cầu. Vui lòng thử lại hoặc gọi ' + CONTACT.phone + '.');
    }
  }

  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-st]');
    const root = document.getElementById('stylist');
    if (!t || !root || !root.contains(t) || t.disabled) return;
    const [a, ...rest] = t.dataset.st.split(':'), v = rest.join(':');
    if (a === 'mode') {
      ST.mode = +v;
      t.parentElement.querySelectorAll('.chip').forEach(c => { c.classList.toggle('on', c === t); c.setAttribute('aria-pressed', c === t); });
      return;
    }
    if (a === 'submit') return submit();
    if (a === 'again') { ST.done = null; return repaint(); }
    if (a === 'login') { S.after = 'stylist'; return go('auth', 'login'); }
    if (a === 'cancel') {
      if (!confirm('Hủy yêu cầu đặt lịch này?')) return;
      try { await bkCancelMine(+v); toast('Đã hủy lịch hẹn'); } catch (x) { toast(x.message); }
      ST.loadedAt = 0;
      try { ST.list = await bkMine(); } catch (x) { }
      repaint();
    }
  });

  window.Pages = { faq, stylist, CONTACT };
  paintFooter();
})();
