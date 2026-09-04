// IDEA 라운지 예약 시스템 — Phase 1+2: 로그인(Google) + 학번 등록 + 테이블 현황 표시.
// 예약 생성/취소 기능은 Phase 3에서 추가됩니다.
//
// 학교 이메일(mju.ac.kr)이 Google 계정 기반이 아니어서 로그인 자체로는 학생 신분을
// 증명할 수 없습니다. 대신 Google 로그인 후 학번을 직접 입력받아 users/{uid}에
// 저장하고, 이 학번이 마이크로디그리 명단(microdegreeRoster)에 있는지로 우선권을
// 판단합니다.

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
  serverTimestamp,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const $ = (sel) => document.querySelector(sel);

function showStatus(el, message, type) {
  el.textContent = message;
  el.className = `status-msg show ${type}`;
}
function hideStatus(el) {
  el.className = "status-msg";
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
      onProfileSaved(profile);
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
// login-panel(로그인 전) → profile-panel(로그인 O, 학번 미등록) → user-panel(등록 완료)

function showPanel(name) {
  const panels = { login: $("#login-panel"), profile: $("#profile-panel"), user: $("#user-panel") };
  Object.entries(panels).forEach(([key, el]) => {
    if (el) el.hidden = key !== name;
  });
}

async function refreshAuthUI(user, tablesList) {
  if (!user) {
    showPanel("login");
    if (tablesList) tablesList.setUser(null, false);
    return;
  }

  const profile = await fetchProfile(user.uid);
  if (!profile) {
    showPanel("profile");
    if (tablesList) tablesList.setUser(user, false);
    return;
  }

  const isPriority = await checkPriorityMembership(profile.studentId);
  $("#user-name").textContent = profile.name;
  $("#user-student-id").textContent = profile.studentId;
  $("#priority-badge").hidden = !isPriority;
  showPanel("user");
  if (tablesList) tablesList.setUser(user, isPriority);
}

// ---------- 테이블 현황 ----------

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
      <h3>${table.name}</h3>
      <p>정원 ${table.capacity}인 · IDEA 라운지(1공학관 513호)</p>
      <div class="tags">${badge}</div>
      ${noteHtml}
    </div>`;
}

function initTablesList() {
  const listEl = $("#tables-list");
  if (!listEl) return;

  let currentUser = null;
  let currentIsPriority = false;
  let latestTables = [];

  const render = (tables) => {
    listEl.innerHTML = tables
      .map((t) => tableCardHTML(t, currentIsPriority, !!currentUser))
      .join("");
  };

  const q = query(collection(db, "tables"), orderBy("name"));
  onSnapshot(
    q,
    (snapshot) => {
      latestTables = snapshot.docs.map((d) => d.data());
      if (!latestTables.length) {
        listEl.innerHTML =
          '<p style="color:var(--ink-500); grid-column:1/-1; text-align:center; padding:40px 0;">아직 테이블 정보가 등록되지 않았습니다. (Firebase 콘솔에서 tables 컬렉션을 먼저 생성해 주세요)</p>';
        return;
      }
      render(latestTables);
    },
    (err) => {
      listEl.innerHTML = `<p style="color:#d92d20; grid-column:1/-1;">테이블 정보를 불러오지 못했습니다: ${err.message}</p>`;
    }
  );

  return {
    setUser: (user, isPriority) => {
      currentUser = user;
      currentIsPriority = isPriority;
      if (latestTables.length) render(latestTables);
    },
  };
}

// ---------- 초기화 ----------

document.addEventListener("DOMContentLoaded", async () => {
  const tablesList = initTablesList();
  initLoginButton();
  initSignOut();
  initProfileForm((profile) => {
    // 등록 직후 바로 갱신 (auth 상태는 그대로이므로 UI만 다시 그림)
    refreshAuthUI(auth.currentUser, tablesList);
  });

  onAuthStateChanged(auth, (user) => {
    refreshAuthUI(user, tablesList);
  });
});
