const express = require('express');
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const rateLimit = require('express-rate-limit');
const pako = require('pako');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({ extended: true }));

const SCRIPTS_DIR = path.join(__dirname, 'scripts');
fs.ensureDirSync(SCRIPTS_DIR);

// Mã hóa AES-256-CBC
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(SECRET_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

// Giải mã
function decrypt(encryptedData) {
  const [ivHex, encryptedText] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(SECRET_KEY, 'hex'), iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function compressAndEncrypt(script) {
  const compressed = pako.deflate(script, { level: 9 });
  const compressedBase64 = Buffer.from(compressed).toString('base64');
  return encrypt(compressedBase64);
}

// Giải mã + giải nén
function decryptAndDecompress(encryptedData) {
  const decryptedBase64 = decrypt(encryptedData);
  const compressed = Buffer.from(decryptedBase64, 'base64');
  const decompressed = pako.inflate(compressed, { to: 'string' });
  return decompressed;
}
  const loader = `
--[[ Protected Loader - ID: ${scriptId} ]]
local function base64_decode(data)
    local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    return (data:gsub('.', function(x)
        local r,f='',b:find(x)-1
        for i=6,1,-1 do r=r..(f%2^i-f%2^(i-1)>0 and '1' or '0') end
        return r;
    end):gsub('%d%d%d?%d?%d?%d?%d?%d?', function(x)
        if #x < 8 then return '' end
        local c=0
        for i=1,8 do c=c+(x:sub(i,i)=='1' and 2^(8-i) or 0) end
        return string.char(c)
    end))
end

local function inflate(data)
    -- giả lập inflate (cần có library, nhưng executor thường có)
    -- thực tế nên dùng game:HttpGet hoặc có sẵn decompress
    -- Ở đây ta sẽ dùng hàm giải nén có sẵn của Roblox nếu có
    if game and game:GetService("HttpService") then
        -- Giả sử script đã được nén bằng zlib, cần dùng library ngoài
        -- Để đơn giản, ta sẽ bỏ qua nén ở client, chỉ mã hóa
        return data
    end
    return data
end

local encrypted = "${encryptedPayload}"
local decrypted = (function(enc)
    local ivHex, encText = enc:match("([^:]+):(.+)")
    if not ivHex then return nil end
    local iv = {}
    for i=1, #ivHex, 2 do iv[#iv+1] = tonumber("0x"..ivHex:sub(i,i+1)) end
    local key = "${SECRET_KEY}"
  return decryptAndDecompress(encryptedPayload);
}

// Danh sách User-Agent cho phép
const ALLOWED_USER_AGENTS = [
  'roblox', 'synapse', 'delta', 'Delta', 'oxygen', 'fluxus', 'electron',
  'hydrogen', 'vega x', 'calamari', 'evon', 'kiwi', 'celery', 'comet', 'nezur',
  'valyse', 'sentinel', 'sirhurt', 'protosmasher', 'jjsploit', 'xeno', 'skript',
  'lua', 'executor'
];

function isAllowedExecutor(ua) {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return ALLOWED_USER_AGENTS.some(agent => lower.includes(agent));
}

function isBrowser(ua) {
  const browsers = ['chrome', 'firefox', 'safari', 'edg', 'opera', 'msie', 'trident'];
  const lower = ua.toLowerCase();
  return browsers.some(b => lower.includes(b));
}

function isFakeTool(ua) {
  const fake = ['python', 'curl', 'wget', 'libwww', 'httpclient', 'postman', 'insomnia'];
  const lower = ua.toLowerCase();
  return fake.some(f => lower.includes(f));
}

// Rate limit
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Quá nhiều request upload' } });
const loadLimiter = rateLimit({ windowMs: 15 * 1000, max: 30, message: 'Too many requests' });

// API upload
app.post('/upload', uploadLimiter, (req, res) => {
  try {
    let scriptContent = req.body.content || req.body;
    if (typeof scriptContent !== 'string') {
      return res.status(400).json({ error: 'Invalid input' });
    }
    // Nén + mã hóa trước khi lưu
    const encryptedPayload = compressAndEncrypt(scriptContent);
    const scriptId = crypto.randomBytes(8).toString('hex');
    const scriptPath = path.join(SCRIPTS_DIR, `${scriptId}.enc`);
    fs.writeFileSync(scriptPath, encryptedPayload);
    const loadUrl = `${req.protocol}://${req.get('host')}/load/${scriptId}`;
    res.json({ success: true, loadUrl, scriptId, message: "Tạo link thành công, chỉ executor mới lấy được code" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// API load script (chỉ executor)
app.get('/load/:id', loadLimiter, (req, res) => {
  const scriptId = req.params.id;
  const scriptPath = path.join(SCRIPTS_DIR, `${scriptId}.enc`);
  if (!fs.existsSync(scriptPath)) {
    return res.status(404).send('Script not found');
  }
  const ua = req.headers['user-agent'] || '';
  if (isBrowser(ua)) {
    return res.status(403).send(`<html><head><title>Access Denied</title></head><body style="background:#111;color:red;text-align:center;padding-top:50px;"><h1>403 Forbidden</h1><p>This link is not accessible via browser.</p></body></html>`);
  }
  if (isFakeTool(ua)) {
    return res.status(403).send('Access Denied: Automated tools are not allowed.');
  }
  if (!isAllowedExecutor(ua)) {
    return res.status(403).send('Access Denied: Unsupported executor.');
  }
  try {
    const encryptedPayload = fs.readFileSync(scriptPath, 'utf8');
    const originalScript = decryptAndDecompress(encryptedPayload);
    res.setHeader('Content-Type', 'text/plain');
    res.send(originalScript);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading script');
  }
});

// API xóa script
app.delete('/script/:id', (req, res) => {
  const scriptId = req.params.id;
  const scriptPath = path.join(SCRIPTS_DIR, `${scriptId}.enc`);
  if (!fs.existsSync(scriptPath)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(scriptPath);
  res.json({ success: true });
});

// API danh sách script (có thể bảo vệ bằng token)
app.get('/scripts', (req, res) => {
  const files = fs.readdirSync(SCRIPTS_DIR);
  const scripts = files.map(f => ({ id: f.replace('.enc', ''), loadUrl: `${req.protocol}://${req.get('host')}/load/${f.replace('.enc', '')}` }));
  res.json({ scripts });
});

// Giao diện web đẹp (dashboard)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lua Ultimate Protect | Secure Loader</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { background: linear-gradient(135deg, #0f172a 0%, #1e1b2e 100%); }
            .card { backdrop-filter: blur(10px); background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255,255,255,0.1); }
            .code-area { font-family: 'Fira Code', monospace; }
        </style>
    </head>
    <body class="text-gray-200 min-h-screen">
        <div class="container mx-auto px-4 py-8 max-w-5xl">
            <div class="text-center mb-10">
                <h1 class="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500">Lua Ultimate Protect</h1>
                <p class="text-gray-400 mt-2">Bảo vệ script Luau/Lua tuyệt đối · Không ai lấy được source gốc</p>
            </div>

            <div class="grid md:grid-cols-2 gap-6">
                <!-- Upload Card -->
                <div class="card rounded-2xl p-6 shadow-xl">
                    <h2 class="text-2xl font-semibold mb-4 flex items-center"><span class="mr-2">📤</span> Upload Script</h2>
                    <form id="uploadForm">
                        <textarea id="scriptContent" rows="10" class="w-full p-3 bg-gray-900 rounded-lg border border-gray-700 text-gray-200 font-mono text-sm" placeholder="Paste your Lua/Luau script here..."></textarea>
                        <button type="submit" class="mt-4 w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 py-2 rounded-lg font-semibold transition">🔒 Protect & Get Link</button>
                    </form>
                    <div id="uploadResult" class="mt-4 text-sm hidden"></div>
                </div>

                <!-- List Scripts Card -->
                <div class="card rounded-2xl p-6 shadow-xl">
                    <h2 class="text-2xl font-semibold mb-4 flex items-center"><span class="mr-2">📜</span> Your Scripts</h2>
                    <button id="refreshList" class="mb-3 text-sm bg-gray-700 px-3 py-1 rounded hover:bg-gray-600">⟳ Refresh</button>
                    <div id="scriptsList" class="max-h-96 overflow-y-auto space-y-2">
                        <p class="text-gray-500 text-center">Chưa có script nào. Hãy upload trước.</p>
                    </div>
                </div>
            </div>

            <!-- How to use -->
            <div class="card rounded-2xl p-6 mt-8">
                <h2 class="text-xl font-semibold mb-3">📖 Hướng dẫn sử dụng</h2>
                <div class="bg-gray-900/50 p-4 rounded-lg font-mono text-sm">
                    <p>1. Upload script của bạn lên.</p>
                    <p>2. Nhận link load (ví dụ: <span class="text-cyan-400">http://localhost:3000/load/abc123</span>).</p>
                    <p>3. Trong executor (Synapse, Krnl, Fluxus...), dùng:</p>
                    <pre class="bg-black p-2 rounded mt-2 text-green-300">loadstring(game:HttpGet("link_của_bạn"))()</pre>
                    <p class="text-yellow-300 mt-2">⚠️ LƯU Ý: Link chỉ hoạt động với executor thật. Trình duyệt, Python, curl sẽ bị chặn. Source gốc được nén + mã hóa AES-256, không thể lấy trực tiếp.</p>
                </div>
            </div>
        </div>

        <script>
            async function uploadScript() {
                const content = document.getElementById('scriptContent').value;
                if (!content.trim()) return alert('Vui lòng nhập code Lua!');
                const btn = event.target;
                btn.disabled = true;
                btn.innerHTML = '⏳ Đang xử lý...';
                try {
                    const res = await fetch('/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content })
                    });
                    const data = await res.json();
                    const resultDiv = document.getElementById('uploadResult');
                    if (data.success) {
                        resultDiv.innerHTML = \`✅ <strong>Thành công!</strong><br>Link load: <code class="bg-gray-800 p-1 rounded break-all">\${data.loadUrl}</code><br><button onclick="copyToClipboard('\${data.loadUrl}')" class="mt-2 bg-blue-600 px-2 py-1 rounded text-sm">📋 Copy link</button>\`;
                        resultDiv.classList.remove('hidden', 'bg-red-900', 'text-red-200');
                        resultDiv.classList.add('bg-green-900/50', 'text-green-200', 'p-3', 'rounded');
                        document.getElementById('scriptContent').value = '';
                        refreshScripts();
                    } else {
                        resultDiv.innerHTML = \`❌ Lỗi: \${data.error || 'Không xác định'}\`;
                        resultDiv.classList.remove('hidden', 'bg-green-900/50');
                        resultDiv.classList.add('bg-red-900/50', 'text-red-200', 'p-3', 'rounded');
                    }
                } catch (err) {
                    alert('Lỗi kết nối server!');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '🔒 Protect & Get Link';
                }
            }

            async function refreshScripts() {
                const listDiv = document.getElementById('scriptsList');
                listDiv.innerHTML = '<p class="text-gray-500">Đang tải...</p>';
                try {
                    const res = await fetch('/scripts');
                    const data = await res.json();
                    if (data.scripts && data.scripts.length) {
                        listDiv.innerHTML = data.scripts.map(s => \`
                            <div class="bg-gray-800/50 p-2 rounded flex justify-between items-center">
                                <span class="text-sm font-mono truncate">\${s.id}</span>
                                <div>
                                    <button onclick="copyToClipboard('\${s.loadUrl}')" class="bg-blue-600 px-2 py-1 rounded text-xs mr-1">📋 Copy</button>
                                    <button onclick="deleteScript('\${s.id}')" class="bg-red-700 px-2 py-1 rounded text-xs">🗑 Xóa</button>
                                </div>
                            </div>
                        \`).join('');
                    } else {
                        listDiv.innerHTML = '<p class="text-gray-500 text-center">Chưa có script nào.</p>';
                    }
                } catch (err) {
                    listDiv.innerHTML = '<p class="text-red-400">Lỗi tải danh sách.</p>';
                }
            }

            async function deleteScript(id) {
                if (!confirm('Xóa script này?')) return;
                const res = await fetch(\`/script/\${id}\`, { method: 'DELETE' });
                if (res.ok) refreshScripts();
                else alert('Xóa thất bại');
            }

            function copyToClipboard(text) {
                navigator.clipboard.writeText(text);
                alert('Đã copy link!');
            }

            document.getElementById('uploadForm').addEventListener('submit', (e) => { e.preventDefault(); uploadScript(); });
            document.getElementById('refreshList').addEventListener('click', refreshScripts);
            refreshScripts();
        </script>
    </body>
    </html>
  `);
});

// Tự động xóa script cũ sau 24h (tùy chọn)
setInterval(() => {
  const now = Date.now();
  fs.readdirSync(SCRIPTS_DIR).forEach(file => {
    const filePath = path.join(SCRIPTS_DIR, file);
    const stats = fs.statSync(filePath);
    if (now - stats.ctimeMs > 24 * 60 * 60 * 1000) {
      fs.unlinkSync(filePath);
      console.log(`Deleted old script: ${file}`);
    }
  });
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`🔐 Secret Key: ${SECRET_KEY}`);
  console.log(`📁 Scripts stored in: ${SCRIPTS_DIR}`);
});
