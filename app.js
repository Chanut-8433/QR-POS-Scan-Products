const $ = (id) => document.getElementById(id);
const els = {
  video: $('video'), status: $('status'), startBtn: $('startBtn'), stopBtn: $('stopBtn'), 
  clearBtn: $('clearBtn'), shareBillBtn: $('shareBillBtn'), list: $('list'), total: $('total'),
  nameInput: $('nameInput'), priceInput: $('priceInput'), 
  qrCanvas: $('qrCanvas'), qrResultArea: $('qrResultArea'),
  flash: $('scan-flash'), beep: $('beep-sound')
};

let qrScanner = null;
let lastScan = '', lastScanTime = 0;
const cart = new Map();
let currentDiscount = { name: '', amount: 0 };

const formatMoney = (v) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(v || 0);

function setStatus(text, type = 'warn') {
  els.status.textContent = text;
  els.status.className = `status ${type}`;
}

// เอฟเฟกต์แจ้งเตือนการสแกนสำเร็จ
function triggerScanFeedback() {
  els.beep.currentTime = 0;
  els.beep.play().catch(() => {});
  els.flash.style.opacity = "1";
  setTimeout(() => { els.flash.style.opacity = "0"; }, 150);
  if (navigator.vibrate) navigator.vibrate(50);
}

function renderList() {
  let subtotal = 0;
  let html = '';
  cart.forEach((item, key) => {
    const sum = item.price * item.qty;
    subtotal += sum;
    html += `<div class="item"><div class="row"><b>${item.name}</b><b>${formatMoney(sum)}</b></div>
      <div class="row" style="margin-top:6px;"><div class="qty-ctrl">
      <button onclick="changeQty('${key}',-1)">−</button><span>${item.qty}</span><button onclick="changeQty('${key}',1)">＋</button>
      </div><small style="color:var(--muted)">ราคา/หน่วย ${item.price}</small></div></div>`;
  });
  els.list.innerHTML = html || '<div style="text-align:center;color:#94a3b8;padding:10px;">ยังไม่มีรายการสินค้า</div>';
  
  const finalTotal = Math.max(0, subtotal - currentDiscount.amount);
  els.total.textContent = formatMoney(finalTotal);
  
  const discArea = $('discount-area');
  if (currentDiscount.amount > 0) {
    discArea.style.display = 'block';
    discArea.textContent = `🎁 ส่วนลด: ${currentDiscount.name} (-${formatMoney(currentDiscount.amount)})`;
  } else {
    discArea.style.display = 'none';
  }
}

window.changeQty = (key, delta) => {
  const item = cart.get(key);
  if (item) { item.qty += delta; if (item.qty <= 0) cart.delete(key); renderList(); }
};

async function shareAndClear() {
  if (cart.size === 0) return setStatus('กรุณาเพิ่มสินค้าก่อนส่งยอด', 'err');
  
  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  let msg = "📋 รายการสรุปยอดขาย\n";
  msg += `📅 วันที่: ${dateStr} | 🕒 เวลา: ${timeStr} น.\n`;
  msg += "------------------------------\n";
  
  cart.forEach(item => {
    msg += `• ${item.name} x ${item.qty} = ${formatMoney(item.price * item.qty)}\n`;
  });

  if(currentDiscount.amount > 0) {
    msg += "------------------------------\n";
    msg += `🎁 ส่วนลด: ${currentDiscount.name} (-${formatMoney(currentDiscount.amount)})\n`;
  }
  
  msg += "=======================\n";
  msg += `💰 ยอดสุทธิ: ${els.total.textContent}\n`;

  try {
    if (navigator.share) {
      await navigator.share({ text: msg });
      cart.clear(); currentDiscount = {name:'', amount:0}; renderList();
      setStatus('แชร์และล้างบิลสำเร็จ', 'ok');
    } else {
      window.open(`https://line.me/R/msg/text/?${encodeURIComponent(msg)}`);
      if(confirm("ส่งข้อมูลแล้ว ต้องการล้างบิลทันทีหรือไม่?")) {
        cart.clear(); currentDiscount = {name:'', amount:0}; renderList();
      }
    }
  } catch (e) { console.log('User cancelled'); }
}

function drawFullQR(name, price, payload, isDiscount = false) {
  const canvas = els.qrCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = 300; canvas.height = 420;
  ctx.fillStyle = "#fff"; ctx.fillRect(0,0,300,420);
  ctx.fillStyle = "#000"; ctx.textAlign = "center";
  
  ctx.font = "bold 22px Sans-Serif";
  ctx.fillText(isDiscount ? "คูปองส่วนลดพิเศษ" : name, 150, 45);
  if(isDiscount) { ctx.font = "16px Sans-Serif"; ctx.fillText(name, 150, 70); }

  const qr = qrcodegen.QrCode.encodeText(payload, qrcodegen.QrCode.Ecc.MEDIUM);
  const size = 180, scale = size / qr.size, ox = (300-size)/2, oy = 95;
  for(let y=0; y<qr.size; y++) for(let x=0; x<qr.size; x++)
    if(qr.getModule(x,y)) ctx.fillRect(ox+(x*scale), oy+(y*scale), scale, scale);

  ctx.font = "900 36px Sans-Serif";
  ctx.fillStyle = isDiscount ? "#ef4444" : "#2563eb";
  ctx.fillText((isDiscount ? "-" : "") + formatMoney(Number(price)), 150, 350);
  
  ctx.font = "12px Sans-Serif"; ctx.fillStyle = "#94a3b8";
  ctx.fillText("Smart POS Offline System", 150, 395);
  els.qrResultArea.style.display = 'block';
}

async function startCam() {
  qrScanner = qrScanner || new QrScanner(els.video, (res) => {
    const data = res?.data || res;
    if (data === lastScan && Date.now() - lastScanTime < 2000) return;
    lastScan = data; lastScanTime = Date.now();
    
    const parts = data.split('|');
    let success = false;
    if (parts[0] === 'DISCOUNT') {
      currentDiscount = { name: decodeURIComponent(parts[1]), amount: Number(parts[2]) };
      setStatus(`ใช้ส่วนลด: ${currentDiscount.name}`, 'ok');
      success = true;
    } else {
      const item = parts.length === 2 ? { name: decodeURIComponent(parts[0]), price: Number(parts[1]) } : null;
      if (item) {
        const key = `${item.name}-${item.price}`;
        if (cart.has(key)) cart.get(key).qty++;
        else cart.set(key, { ...item, qty: 1 });
        setStatus(`เพิ่ม ${item.name}`, 'ok');
        success = true;
      }
    }
    if (success) { triggerScanFeedback(); renderList(); }
  }, { preferredCamera: 'environment', highlightScanRegion: true });
  await qrScanner.start();
  els.startBtn.disabled = true; els.stopBtn.disabled = false;
}

$('startBtn').onclick = startCam;
$('stopBtn').onclick = () => { qrScanner?.stop(); els.startBtn.disabled = false; els.stopBtn.disabled = true; };
$('clearBtn').onclick = () => { if(confirm('ต้องการล้างบิลนี้ใช่หรือไม่?')) { cart.clear(); currentDiscount = {name:'', amount:0}; renderList(); } };
$('shareBillBtn').onclick = shareAndClear;
$('genProductBtn').onclick = () => {
  const n = $('nameInput').value, p = $('priceInput').value;
  if(n && p) drawFullQR(n, p, `${encodeURIComponent(n)}|${p}`);
};
$('genDiscountBtn').onclick = () => {
  const n = $('nameInput').value, p = $('priceInput').value;
  if(n && p) drawFullQR(n, p, `DISCOUNT|${encodeURIComponent(n)}|${p}`, true);
};
$('downloadQrBtn').onclick = async () => {
  const blob = await new Promise(r => els.qrCanvas.toBlob(r));
  const file = new File([blob], "pos-qr.png", {type:"image/png"});
  if(navigator.canShare && navigator.canShare({files:[file]})) await navigator.share({files:[file]});
  else { const a = document.createElement('a'); a.href = els.qrCanvas.toDataURL(); a.download = "pos-qr.png"; a.click(); }
};

document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab, .view').forEach(el => el.classList.remove('active'));
  t.classList.add('active'); $(t.dataset.tab).classList.add('active');
});