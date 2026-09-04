// IDEA 라운지 예약 시스템
// Phase 1+2: 로그인(Google) + 학번 등록 + 테이블 현황
// Phase 3: 실제 예약 생성/취소 (날짜별 시간대 그리드, 실시간 반영, 중복 예약 차단)
//
// 중복 예약 차단 원리: 예약 문서 ID를 "{tableId}_{date}_{startTime}"로 고정하고,
// Firestore 보안 규칙에서 이미 존재하는 문서에 대한 쓰기(update)는 항상 거부하도록
// 되어 있습니다. 따라서 두 사람이 같은 슬롯을 동시에 클릭해도 먼저 도착한 요청만
// "생성"으로 처리되고 나중 요청은 "수정"으로 취급되어 규칙에 의해 자동으로 막힙니다.

import { auth, db } from "./firebase-init.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const DAILY_LIMIT_HOURS = 2;
const WINDOW_LIMIT_HOURS = 6; // 예약 가능한 2주(14일) 구간 내 1인당 누적 한도

const OPEN_HOUR = 9;
const CLOSE_HOUR = 21; // 마지막 슬롯은 20:00~21:00
const BOOKING_WINDOW_DAYS = 13; // 오늘 포함 최대 14일 후까지 예약 가능

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

function showToast(message, type) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " toast--error" : type === "success" ? " toast--success" : "");
  el.textContent = message;
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeSlots() {
  const slots = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    slots.push({ start: `${String(h).padStart(2, "0")}:00`, end: `${String(h + 1).padStart(2, "0")}:00` });
  }
  return slots;
}

function isPastSlot(dateStr, startTime) {
  const now = new Date();
  const slotStart = new Date(`${dateStr}T${startTime}:00`);
  return slotStart.getTime() <= now.getTime();
}

// ---------- 로그인 (Google) ----------

function initLoginButton() {
  const btn = $("#google-login-btn");
  const statusEl = $("#login-status");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    hideStatus(statusEl);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user") return;
      if (err.code === "auth/popup-blocked") {
        showStatus(statusEl, "팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도해 주세요.", "error");
        return;
      }
      showStatus(statusEl, `로그인에 실패했습니다: ${err.message}`, "error");
    }
  });
}

function initSignOut() {
  const btn = $("#logout-btn");
  if (!btn) return;
  btn.addEventListener("click", () => signOut(auth));
}

// ---------- 학번 등록 ----------

async function fetchProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

function initProfileForm(onProfileSaved) {
  const form = $("#profile-form");
  const statusEl = $("#profile-status");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideStatus(statusEl);
    const studentId = $("#profile-student-id").value.trim();
    const name = $("#profile-name").value.trim();
    if (!studentId || !name) {
      showStatus(statusEl, "학번과 이름을 모두 입력해 주세요.", "error");
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "등록 중…";
    try {
      const profile = { studentId, name, email: user.email || "", createdAt: serverTimestamp() };
      await setDoc(doc(db, "users", user.uid), profile);
      onProfileSaved();
    } catch (err) {
      showStatus(statusEl, `등록에 실패했습니다: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "등록하기";
    }
  });
}

async function checkPriorityMembership(studentId) {
  try {
    const snap = await getDoc(doc(db, "microdegreeRoster", studentId));
    return snap.exists();
  } catch (err) {
    return false;
  }
}

// ---------- 화면 상태 전환 ----------

function showPanel(name) {
  const panels = { login: $("#login-panel"), profile: $("#profile-panel"), user: $("#user-panel") };
  Object.entries(panels).forEach(([key, el]) => {
    if (el) el.hidden = key !== name;
  });
}

// ---------- 테이블 현황 카드 ----------

function tableCardHTML(table, isPriority, isLoggedIn) {
  const isPriorityOnly = table.accessLevel === "priority-only";
  const badge = isPriorityOnly
    ? '<span class="tag">마이크로디그리 전용</span>'
    : '<span class="tag">전체 이용 가능</span>';
  let noteHtml = "";
  if (isLoggedIn && isPriorityOnly && !isPriority) {
    noteHtml = '<p style="color:#d92d20; font-size:13px; margin-top:8px;">마이크로디그리 참여 학생만 예약할 수 있는 테이블입니다.</p>';
  }
  return `
    <div class="card">
      <h3>${escapeHtml(table.name)}</h3>
      <p>정원 ${table.capacity}인 · IDEA 라운지(1공학관 513호)</p>
      <div class="tags">${badge}</div>
      ${noteHtml}
    </div>`;
}

function initTablesSummary(getState) {
  const listEl = $("#tables-list");
  if (!listEl) return;

  const render = () => {
    const { tables, isLoggedIn, isPriority } = getState();
    if (!tables.length) {
      listEl.innerHTML =
        '<p style="color:var(--ink-500); grid-column:1/-1; text-align:center; padding:40px 0;">아직 테이블 정보가 등록되지 않았습니다. (Firebase 콘솔에서 tables 컬렉션을 먼저 생성해 주세요)</p>';
      return;
    }
    listEl.innerHTML = tables.map((t) => tableCardHTML(t, isPriority, isLoggedIn)).join("");
  };
  return { render };
}

// ---------- 예약 그리드 (Phase 3) ----------

function BookingModule() {
  let unsubReservations = null;
  let unsubMine = null;
  let currentDate = localDateStr(new Date());
  let reservationsByKey = {}; // "tableId_startTime" -> reservation data
  let myReservationsById = {}; // reservationId -> reservation data
  let ctx = { uid: null, studentId: null, name: null, isPriority: false };

  function slotButtonHTML(table, slot) {
    const key = `${table.id}_${slot.start}`;
    const reservation = reservationsByKey[key];

    if (reservation) {
      if (reservation.uid === ctx.uid) {
        return `<button type="button" class="slot-btn is-mine" data-cancel="${key}">내 예약 · 취소</button>`;
      }
      return `<button type="button" class="slot-btn is-booked" disabled>예약됨${reservation.name ? ` (${escapeHtml(reservation.name)})` : ""}</button>`;
    }
    if (isPastSlot(currentDate, slot.start)) {
      return `<button type="button" class="slot-btn" disabled>마감</button>`;
    }
    if (table.accessLevel === "priority-only" && !ctx.isPriority) {
      return `<button type="button" class="slot-btn" disabled title="마이크로디그리 전용 테이블입니다">우선권 필요</button>`;
    }
    return `<button type="button" class="slot-btn" data-book="${table.id}|${slot.start}|${slot.end}">예약하기</button>`;
  }

  function renderGrid(tables) {
    const wrap = $("#booking-grid-wrap");
    if (!wrap || !tables.length) return;
    const slots = timeSlots();
    const head = `<tr><th>시간</th>${tables.map((t) => `<th>${escapeHtml(t.name)}</th>`).join("")}</tr>`;
    const rows = slots
      .map(
        (slot) => `<tr><th>${slot.start}</th>${tables.map((t) => `<td>${slotButtonHTML(t, slot)}</td>`).join("")}</tr>`
      )
      .join("");
    wrap.innerHTML = `<table class="booking-table"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  function renderMyReservations(items) {
    const el = $("#my-reservations");
    if (!el) return;
    if (!items.length) {
      el.innerHTML = '<p style="color:var(--ink-500); text-align:center; padding:24px 0;">예약 내역이 없습니다.</p>';
      return;
    }
    const sorted = [...items].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    el.innerHTML = sorted
      .map(
        (r) => `
      <div class="admin-row">
        <div>
          <div class="title">${escapeHtml(r.tableName || r.tableId)} · ${escapeHtml(r.date)} ${escapeHtml(r.startTime)}~${escapeHtml(r.endTime)}</div>
          <div class="meta">${escapeHtml(r.name || "")}</div>
        </div>
        <button type="button" class="btn btn--outline btn--sm" data-cancel-id="${r.id}">취소</button>
      </div>`
      )
      .join("");
  }

  function subscribeDate(date, tables) {
    if (unsubReservations) unsubReservations();
    currentDate = date;
    const q = query(collection(db, "reservations"), where("date", "==", date));
    unsubReservations = onSnapshot(
      q,
      (snapshot) => {
        reservationsByKey = {};
        snapshot.forEach((d) => {
          const data = d.data();
          reservationsByKey[`${data.tableId}_${data.startTime}`] = data;
        });
        renderGrid(tables);
      },
      (err) => {
        const wrap = $("#booking-grid-wrap");
        if (wrap) wrap.innerHTML = `<p style="color:#d92d20;">예약 현황을 불러오지 못했습니다: ${err.message}</p>`;
      }
    );
  }

  function subscribeMine(uid, tables) {
    if (unsubMine) unsubMine();
    const q = query(collection(db, "reservations"), where("uid", "==", uid));
    unsubMine = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        const table = tables.find((t) => t.id === data.tableId);
        return { id: d.id, ...data, tableName: table ? table.name : data.tableId };
      });
      myReservationsById = Object.fromEntries(items.map((r) => [r.id, r]));
      renderMyReservations(items);
    });
  }

  // 예약 가능한 2주(오늘~13일 후) 구간 안에서 내가 이미 예약한 시간 합계.
  // myReservationsById는 실시간 구독으로 항상 최신 상태이므로, 지난 날짜는 자연히
  // 범위에서 빠지고(=롤링 윈도우) 매일 자동으로 한도가 갱신됩니다.
  function windowHoursUsed() {
    const today = localDateStr(new Date());
    const windowEnd = localDateStr(
      new Date(new Date().setDate(new Date().getDate() + BOOKING_WINDOW_DAYS))
    );
    return Object.values(myReservationsById).filter((r) => r.date >= today && r.date <= windowEnd).length;
  }

  async function bookSlot(tableId, startTime, endTime, btnEl) {
    if (windowHoursUsed() >= WINDOW_LIMIT_HOURS) {
      showToast(`예약 가능한 2주 내에는 최대 ${WINDOW_LIMIT_HOURS}시간까지만 예약할 수 있습니다.`, "error");
      return;
    }

    const reservationId = `${tableId}_${currentDate}_${startTime}`;
    const usageId = `${ctx.uid}_${currentDate}`;
    const usageRef = doc(db, "dailyUsage", usageId);
    const reservationRef = doc(db, "reservations", reservationId);

    try {
      await runTransaction(db, async (tx) => {
        const usageSnap = await tx.get(usageRef);
        const usedHours = usageSnap.exists() ? usageSnap.data().hours : 0;
        if (usedHours >= DAILY_LIMIT_HOURS) {
          throw new Error("DAILY_LIMIT_REACHED");
        }

        tx.set(reservationRef, {
          uid: ctx.uid,
          studentId: ctx.studentId,
          name: ctx.name,
          tableId,
          date: currentDate,
          startTime,
          endTime,
          status: "confirmed",
          createdAt: serverTimestamp(),
        });

        if (usageSnap.exists()) {
          tx.update(usageRef, { hours: usedHours + 1 });
        } else {
          tx.set(usageRef, { uid: ctx.uid, date: currentDate, hours: 1 });
        }
      });
      if (btnEl) {
        btnEl.classList.add("just-booked");
        setTimeout(() => btnEl.classList.remove("just-booked"), 700);
      }
      showToast("예약이 완료되었습니다.", "success");
    } catch (err) {
      if (err.message === "DAILY_LIMIT_REACHED") {
        showToast(`하루 최대 ${DAILY_LIMIT_HOURS}시간까지만 예약할 수 있습니다.`, "error");
      } else if (err.code === "permission-denied") {
        showToast("이미 다른 사람이 예약했거나 예약 권한이 없는 테이블입니다. 화면을 새로고침해 주세요.", "error");
      } else {
        showToast(`예약에 실패했습니다: ${err.message}`, "error");
      }
    }
  }

  async function cancelReservation(reservation, reservationId) {
    if (!confirm("이 예약을 취소할까요?")) return;
    const usageId = `${reservation.uid}_${reservation.date}`;
    const usageRef = doc(db, "dailyUsage", usageId);
    const reservationRef = doc(db, "reservations", reservationId);

    try {
      await runTransaction(db, async (tx) => {
        const usageSnap = await tx.get(usageRef);
        tx.delete(reservationRef);
        if (usageSnap.exists()) {
          const remaining = Math.max(usageSnap.data().hours - 1, 0);
          tx.update(usageRef, { hours: remaining });
        }
      });
      showToast("예약이 취소되었습니다.", "success");
    } catch (err) {
      showToast(`취소에 실패했습니다: ${err.message}`, "error");
    }
  }

  function initInteractions(getTables) {
    const dateInput = $("#booking-date");
    if (dateInput) {
      const today = new Date();
      const max = new Date();
      max.setDate(today.getDate() + BOOKING_WINDOW_DAYS);
      dateInput.min = localDateStr(today);
      dateInput.max = localDateStr(max);
      if (!dateInput.value) dateInput.value = localDateStr(today);
      dateInput.addEventListener("change", () => {
        subscribeDate(dateInput.value || localDateStr(today), getTables());
      });
    }

    const gridWrap = $("#booking-grid-wrap");
    if (gridWrap) {
      gridWrap.addEventListener("click", (e) => {
        const bookBtn = e.target.closest("[data-book]");
        if (bookBtn) {
          const [tableId, startTime, endTime] = bookBtn.dataset.book.split("|");
          bookSlot(tableId, startTime, endTime, bookBtn);
          return;
        }
        const cancelBtn = e.target.closest("[data-cancel]");
        if (cancelBtn) {
          const key = cancelBtn.dataset.cancel;
          const reservation = reservationsByKey[key];
          if (reservation) cancelReservation(reservation, `${reservation.tableId}_${reservation.date}_${reservation.startTime}`);
        }
      });
    }

    const myListEl = $("#my-reservations");
    if (myListEl) {
      myListEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-cancel-id]");
        if (btn) {
          const reservation = myReservationsById[btn.dataset.cancelId];
          if (reservation) cancelReservation(reservation, btn.dataset.cancelId);
        }
      });
    }
  }

  function start(user, profile, isPriority, tables) {
    ctx = { uid: user.uid, studentId: profile.studentId, name: profile.name, isPriority };
    $("#booking-login-required").hidden = true;
    $("#booking-section").hidden = false;
    const dateInput = $("#booking-date");
    subscribeDate((dateInput && dateInput.value) || currentDate, tables);
    subscribeMine(user.uid, tables);
  }

  function stop() {
    if (unsubReservations) unsubReservations();
    if (unsubMine) unsubMine();
    unsubReservations = null;
    unsubMine = null;
    reservationsByKey = {};
    myReservationsById = {};
    const loginRequired = $("#booking-login-required");
    const section = $("#booking-section");
    if (loginRequired) loginRequired.hidden = false;
    if (section) section.hidden = true;
    const myListEl = $("#my-reservations");
    if (myListEl) myListEl.innerHTML = "";
  }

  return { start, stop, initInteractions, refreshGrid: (tables) => renderGrid(tables) };
}

// ---------- 테이블 목록 로딩 (전역 공유) ----------

function initTablesFeed(onChange) {
  const q = query(collection(db, "tables"), orderBy("name"));
  onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    () => onChange([])
  );
}

// ---------- 초기화 ----------

document.addEventListener("DOMContentLoaded", () => {
  let tables = [];
  let uiState = { isLoggedIn: false, isPriority: false };

  const summary = initTablesSummary(() => ({ tables, ...uiState }));
  const booking = BookingModule();
  booking.initInteractions(() => tables);

  initTablesFeed((newTables) => {
    tables = newTables;
    if (summary) summary.render();
    booking.refreshGrid(tables);
  });

  initLoginButton();
  initSignOut();
  initProfileForm(() => refreshAuthUI(auth.currentUser));

  async function refreshAuthUI(user) {
    if (!user) {
      uiState = { isLoggedIn: false, isPriority: false };
      showPanel("login");
      booking.stop();
      if (summary) summary.render();
      return;
    }

    const profile = await fetchProfile(user.uid);
    if (!profile) {
      uiState = { isLoggedIn: true, isPriority: false };
      showPanel("profile");
      booking.stop();
      if (summary) summary.render();
      return;
    }

    const isPriority = await checkPriorityMembership(profile.studentId);
    uiState = { isLoggedIn: true, isPriority };
    $("#user-name").textContent = profile.name;
    $("#user-student-id").textContent = profile.studentId;
    $("#priority-badge").hidden = !isPriority;
    showPanel("user");
    if (summary) summary.render();
    booking.start(user, profile, isPriority, tables);
  }

  onAuthStateChanged(auth, (user) => {
    refreshAuthUI(user);
  });
});
