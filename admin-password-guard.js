/*
  حماية مؤقتة لصفحة admin.html.
  مهم: هذه ليست حماية حقيقية؛ لأن JavaScript يصل إلى المتصفح ويمكن تجاوزه.
  استخدمها مؤقتًا فقط إلى أن يتم إعداد Cloudflare Access.

  طريقة الاستخدام داخل admin.html:
  1) أضف هذا السطر قبل </head>:
     <script src="admin-password-guard.js" defer></script>
  2) ارفع الملفين إلى نفس المجلد.
  3) غيّر TEMP_PASSWORD قبل النشر.
*/

(() => {
  "use strict";

  const TEMP_PASSWORD = "Saleh@2026#Temp"; // غيّر كلمة المرور قبل الرفع
  const SESSION_KEY = "saleh_admin_authenticated_v1";
  const LOGOUT_KEY = "saleh_admin_logout_v1";

  const style = document.createElement("style");
  style.textContent = `
    html.admin-locked body > *:not(#temporaryAdminGate) {
      visibility: hidden !important;
    }
    #temporaryAdminGate {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #0d2f23;
      color: #f5f0e5;
      font-family: Arial, Tahoma, sans-serif;
      direction: rtl;
    }
    #temporaryAdminGate[hidden] { display: none; }
    .temporary-admin-card {
      width: min(100%, 430px);
      padding: 30px;
      border: 1px solid rgba(190, 155, 88, .6);
      border-radius: 22px;
      background: #123d2d;
      box-shadow: 0 20px 70px rgba(0,0,0,.28);
      text-align: right;
    }
    .temporary-admin-brand {
      margin-bottom: 8px;
      color: #c4a366;
      font-size: 11px;
      letter-spacing: .2em;
      direction: ltr;
      text-align: left;
    }
    .temporary-admin-card h1 { margin: 0 0 10px; font-size: 26px; }
    .temporary-admin-card p { color: #d9d3c6; line-height: 1.8; font-size: 13px; }
    .temporary-admin-card input {
      width: 100%;
      box-sizing: border-box;
      margin: 12px 0;
      padding: 14px 16px;
      border: 1px solid rgba(255,255,255,.25);
      border-radius: 10px;
      background: #f5f0e5;
      color: #173d2c;
      font-size: 16px;
      direction: ltr;
      text-align: left;
    }
    .temporary-admin-card button {
      width: 100%;
      padding: 13px 16px;
      border: 0;
      border-radius: 10px;
      background: #c4a366;
      color: #173d2c;
      cursor: pointer;
      font-weight: 700;
      font-size: 15px;
    }
    .temporary-admin-error { min-height: 22px; color: #ffb3a8; font-size: 12px; }
    .temporary-admin-note { margin-top: 18px; color: #b8c5bb !important; font-size: 11px !important; }
  `;
  document.head.appendChild(style);
  document.documentElement.classList.add("admin-locked");

  const gate = document.createElement("section");
  gate.id = "temporaryAdminGate";
  gate.setAttribute("aria-label", "تسجيل دخول لوحة التحكم");
  gate.innerHTML = `
    <div class="temporary-admin-card">
      <div class="temporary-admin-brand">SALEH.DESIGN</div>
      <h1>لوحة التحكم محمية</h1>
      <p>أدخل كلمة المرور المؤقتة للوصول إلى إدارة المشاريع.</p>
      <form id="temporaryAdminForm" autocomplete="off">
        <label for="temporaryAdminPassword">كلمة المرور</label>
        <input id="temporaryAdminPassword" type="password" autocomplete="current-password" required autofocus>
        <div class="temporary-admin-error" id="temporaryAdminError" role="alert" aria-live="polite"></div>
        <button type="submit">دخول</button>
      </form>
      <p class="temporary-admin-note">هذه حماية مؤقتة. يجب استبدالها بـ Cloudflare Access قبل الاعتماد النهائي.</p>
    </div>
  `;
  document.body.prepend(gate);

  const form = document.getElementById("temporaryAdminForm");
  const input = document.getElementById("temporaryAdminPassword");
  const error = document.getElementById("temporaryAdminError");

  function unlock() {
    sessionStorage.setItem(SESSION_KEY, "1");
    document.documentElement.classList.remove("admin-locked");
    gate.hidden = true;
    input.value = "";
  }

  function lock() {
    sessionStorage.removeItem(SESSION_KEY);
    document.documentElement.classList.add("admin-locked");
    gate.hidden = false;
    input.focus();
  }

  if (sessionStorage.getItem(SESSION_KEY) === "1") unlock();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (input.value === TEMP_PASSWORD) {
      error.textContent = "";
      unlock();
    } else {
      error.textContent = "كلمة المرور غير صحيحة.";
      input.value = "";
      input.focus();
    }
  });

  // يمكن استدعاؤها من أي زر داخل لوحة التحكم عند الحاجة:
  window.salehAdminLogout = lock;
})();
