// IDEA 라운지 예약 관리자 화면
// 접근 자체는 Google 로그인으로 하되, 실제 쓰기 권한은 firestore.rules의 isAdmin()
// (지정된 관리자 이메일 목록)으로 서버 단에서 강제됩니다. 아래 ADMIN_EMAILS는 화면
// 분기용일 뿐이며, 이 목록을 바꿔도 규칙을 함께 바꾸지 않으면 실제 권한은 바뀌지 않습니다.

import { auth, db } from "./firebase-init.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const ADMIN_EMAILS = ["mthan@mju.ac.kr"];

const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
function showStatus(el, message, type) {
  el.textContent = message;
  el.className = `status-msg show ${type}`;
}
function hideStatus(el) {
  el.className = "status-msg";
}
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function showPanel(name) {
  const panels = { login: $("#login-panel"), denied: $("#denied-panel"), admin: $("#admin-content") };
  Object.entries(panels).forEach(([key, el]) => {
    if (el) el.hidden = key !== name;
  });
  $("#logout-btn").hidden = name === "login";
}

// ---------- 로그인 ----------

function initLoginButton() {
  const btn = $("#google-login-btn");
  const statusEl = $("#login-status");
  btn.addEventListener("click", async () => {
    hideStatus(statusEl);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user") return;
      showStatus(statusEl, `로그인에 실패했습니다: ${err.message}`, "error");
    }
  });
}

function initLogout() {
  $("#logout-btn").addEventListener("click", () => signOut(auth));
}

// ---------- 마이크로디그리 명단 관리 ----------

function initRoster(adminEmail) {
  const listEl = $("#roster-list");
  const countEl = $("#roster-count");
  const form = $("#roster-form");
  const statusEl = $("#roster-status");

  onSnapshot(collection(db, "microdegreeRoster"), (snapshot) => {
    const ids = snapshot.docs.map((d) => d.id).sort();
    countEl.textContent = String(ids.length);
    listEl.innerHTML = ids.length
      ? ids.map((id) => `<span class="roster-chip">${escapeHtml(id)} <button type="button" data-remove="${escapeHtml(id)}" title="삭제">×</button></span>`).join("")
      : '<p style="color:var(--ink-500);">등록된 학생이 없습니다.</p>';
  });

  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    const studentId = btn.dataset.remove;
    if (!confirm(`${studentId} 학번을 명단에서 삭제할까요?`)) return;
    try {
      await deleteDoc(doc(db, "microdegreeRoster", studentId));
    } catch (err) {
      alert(`삭제에 실패했습니다: ${err.message}`);
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideStatus(statusEl);
    const raw = $("#roster-textarea").value;
    const studentIds = [...new Set(raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))];
    if (!studentIds.length) {
      showStatus(statusEl, "등록할 학번을 입력해 주세요.", "error");
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "등록 중…";
    try {
      const CHUNK = 400;
      for (let i = 0; i < studentIds.length; i += CHUNK) {
        const batch = writeBatch(db);
        studentIds.slice(i, i + CHUNK).forEach((studentId) => {
          batch.set(doc(db, "microdegreeRoster", studentId), { addedAt: serverTimestamp(), addedBy: adminEmail });
        });
        await batch.commit();
      }
      showStatus(statusEl, `${studentIds.length}명을 등록했습니다.`, "success");
      form.reset();
    } catch (err) {
      showStatus(statusEl, `등록에 실패했습니다: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "일괄 등록";
    }
  });
}

// ---------- 예약 관리 ----------

function initReservations() {
  const dateInput = $("#admin-date");
  const listEl = $("#admin-reservations-list");
  let tables = [];
  let unsub = null;
  let itemsById = {};

  onSnapshot(query(collection(db, "tables"), orderBy("name")), (snapshot) => {
    tables = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  });

  function render(items) {
    if (!items.length) {
      listEl.innerHTML = '<p style="color:var(--ink-500); text-align:center; padding:24px 0;">이 날짜에 예약이 없습니다.</p>';
      return;
    }
    const sorted = [...items].sort((a, b) => (a.startTime + a.tableId).localeCompare(b.startTime + b.tableId));
    listEl.innerHTML = sorted
      .map((r) => {
        const table = tables.find((t) => t.id === r.tableId);
        return `
      <div class="admin-row">
        <div>
          <div class="title">${escapeHtml(table ? table.name : r.tableId)} · ${escapeHtml(r.startTime)}~${escapeHtml(r.endTime)}</div>
          <div class="meta">${escapeHtml(r.name || "")} (${escapeHtml(r.studentId || "")})</div>
        </div>
        <button type="button" class="btn btn--danger btn--sm" data-admin-cancel="${r.id}">취소</button>
      </div>`;
      })
      .join("");
  }

  async function cancelReservation(reservation) {
    if (!confirm("이 예약을 관리자 권한으로 취소할까요?")) return;
    const reservationRef = doc(db, "reservations", reservation.id);
    const usageRef = doc(db, "dailyUsage", `${reservation.uid}_${reservation.date}`);
    try {
      await runTransaction(db, async (tx) => {
        const usageSnap = await tx.get(usageRef);
        tx.delete(reservationRef);
        if (usageSnap.exists()) {
          tx.update(usageRef, { hours: Math.max(usageSnap.data().hours - 1, 0) });
        }
      });
    } catch (err) {
      alert(`취소에 실패했습니다: ${err.message}`);
    }
  }

  function subscribe(date) {
    if (unsub) unsub();
    const q = query(collection(db, "reservations"), where("date", "==", date));
    unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      itemsById = Object.fromEntries(items.map((r) => [r.id, r]));
      render(items);
    });
  }

  const today = localDateStr(new Date());
  dateInput.value = today;
  subscribe(today);
  dateInput.addEventListener("change", () => subscribe(dateInput.value || today));

  listEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-admin-cancel]");
    if (!btn) return;
    const reservation = itemsById[btn.dataset.adminCancel];
    if (reservation) cancelReservation(reservation);
  });
}

// ---------- 초기화 ----------

document.addEventListener("DOMContentLoaded", () => {
  initLoginButton();
  initLogout();

  let initialized = false;

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      showPanel("login");
      return;
    }
    if (!ADMIN_EMAILS.includes(user.email)) {
      $("#denied-email").textContent = user.email;
      showPanel("denied");
      return;
    }
    showPanel("admin");
    if (!initialized) {
      initialized = true;
      initRoster(user.email);
      initReservations();
    }
  });
});
