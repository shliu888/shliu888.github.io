// =========================================================================
// 360 Education with My Peers - Web App (GitHub Pages)
// Fully mirrors MatchApp.swift layout & connects to the same Firebase
// =========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Firebase Configuration matching MatchApp.swift
const firebaseConfig = {
  apiKey: "AIzaSyCG8aXpetsA8FicoinFev93-5eAgQpirj4",
  authDomain: "teachingapp-35b80.firebaseapp.com",
  projectId: "teachingapp-35b80",
  storageBucket: "teachingapp-35b80.firebasestorage.app",
  messagingSenderId: "709926457791",
  appId: "1:709926457791:ios:645f6a600ef184d50ad10a",
  databaseURL: "https://teachingapp-35b80-default-rtdb.firebaseio.com"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Application State
let currentUser = null;
let appUser = null;
let currentScreen = "landing";
let activeTab = "music";
let currentSubject = "Music";
let unsubscribers = [];

// Context for Detail Views
let currentTeacherStudent = null; // { studentId, studentName, subject, goal }
let currentStudentGoal = null;    // { id, goalText, notes, teacherName, subject, studentId }
let currentLesson = null;         // { id, progressNote, notes, teacherName, createdAt, subject }
let currentChatThread = null;     // { otherId, otherName, otherRole, threadId }
let manualStudentMode = false;
let editingGoalId = null;

// =========================================================================
// Navigation Router
// =========================================================================
window.navigate = function(targetScreenId, params = {}) {
  const targetEl = document.getElementById(`screen-${targetScreenId}`);
  if (!targetEl) return;

  // Clear live listeners when exiting detail screens
  if (["lesson-detail", "dm-thread", "teacher-student", "student-progress"].includes(currentScreen)) {
    clearScreenListeners();
  }

  // Switch screen
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  targetEl.classList.add("active");
  currentScreen = targetScreenId;

  // Bottom Tab Bar visibility
  const rootTabs = ["music", "academic", "chat", "more"];
  const tabBar = document.getElementById("tab-bar");
  if (currentUser && appUser && rootTabs.includes(targetScreenId)) {
    tabBar.style.display = "flex";
    updateTabBarUI(targetScreenId);
    activeTab = targetScreenId;
  } else {
    tabBar.style.display = "none";
  }

  // Initialize specific screens
  if (targetScreenId === "music") {
    currentSubject = "Music";
    loadSubjectView("Music");
  } else if (targetScreenId === "academic") {
    currentSubject = "Academic";
    loadSubjectView("Academic");
  } else if (targetScreenId === "chat") {
    loadChatInbox();
  } else if (targetScreenId === "more") {
    renderMoreScreen();
  } else if (targetScreenId === "teacher-student") {
    renderTeacherStudentDetail(params);
  } else if (targetScreenId === "student-progress") {
    renderStudentProgress(params);
  } else if (targetScreenId === "lesson-detail") {
    renderLessonDetail(params);
  } else if (targetScreenId === "dm-thread") {
    renderDMThread(params);
  } else if (targetScreenId === "account") {
    renderAccountScreen();
  }
};

function updateTabBarUI(tabName) {
  document.querySelectorAll(".tab-item").forEach(item => {
    item.classList.toggle("active", item.getAttribute("data-tab") === tabName);
  });
}

function clearScreenListeners() {
  unsubscribers.forEach(unsub => {
    try { unsub(); } catch (e) {}
  });
  unsubscribers = [];
}

// =========================================================================
// Authentication Observer
// =========================================================================
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    try {
      const userDoc = await getDoc(doc(db, "users_v2", user.uid));
      if (userDoc.exists()) {
        appUser = { id: userDoc.id, ...userDoc.data() };
      } else {
        appUser = {
          id: user.uid,
          email: user.email,
          name: user.displayName || user.email?.split("@")[0] || "User",
          role: "student"
        };
      }
      navigate(activeTab || "music");
    } catch (e) {
      console.warn("Could not load user profile:", e);
      appUser = {
        id: user.uid,
        email: user.email,
        name: user.displayName || user.email?.split("@")[0] || "User",
        role: "student"
      };
      navigate("music");
    }
  } else {
    appUser = null;
    navigate("landing");
  }
});

// =========================================================================
// 1. Landing & Auth Flow
// =========================================================================
document.getElementById("btn-get-started").addEventListener("click", () => {
  navigate("auth-choice");
});

document.getElementById("btn-choice-signup").addEventListener("click", () => {
  setAuthMode("signup");
  navigate("auth");
});

document.getElementById("btn-choice-login").addEventListener("click", () => {
  setAuthMode("login");
  navigate("auth");
});

// Segmented Control (Log In vs Sign Up)
document.querySelectorAll("#auth-mode-segmented .segmented-option").forEach(btn => {
  btn.addEventListener("click", () => {
    setAuthMode(btn.dataset.mode);
  });
});

function setAuthMode(mode) {
  document.querySelectorAll("#auth-mode-segmented .segmented-option").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  const isSignUp = mode === "signup";
  document.getElementById("signup-fields").style.display = isSignUp ? "block" : "none";
  document.getElementById("auth-forgot-row").style.display = isSignUp ? "none" : "block";
  document.getElementById("btn-auth-submit").textContent = isSignUp ? "Create Account" : "Log In";
  document.getElementById("auth-nav-title").textContent = isSignUp ? "Create Account" : "Log In";
  hideAuthError();
}

// Role Selection (Student vs Teacher)
document.querySelectorAll("#role-segmented .segmented-option").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#role-segmented .segmented-option").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const isTeacher = btn.dataset.role === "teacher";
    document.getElementById("student-only-fields").style.display = isTeacher ? "none" : "block";
    document.getElementById("teacher-only-fields").style.display = isTeacher ? "block" : "none";
  });
});

document.getElementById("auth-teacher-grade").addEventListener("change", (e) => {
  document.getElementById("teacher-other-wrap").style.display = e.target.value === "Other" ? "block" : "none";
});

// Submit Log In / Sign Up
document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const isSignUp = document.querySelector("#auth-mode-segmented .segmented-option.active").dataset.mode === "signup";
  const email = document.getElementById("auth-email").value.trim().toLowerCase();
  const password = document.getElementById("auth-password").value;
  const submitBtn = document.getElementById("btn-auth-submit");

  hideAuthError();
  submitBtn.disabled = true;
  submitBtn.textContent = "Please wait…";

  try {
    if (isSignUp) {
      const role = document.querySelector("#role-segmented .segmented-option.active").dataset.role;
      const name = document.getElementById("auth-name").value.trim() || "User";
      const gender = document.getElementById("auth-gender").value.trim();

      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      const userData = {
        id: uid,
        name,
        email,
        role,
        gender,
        createdAt: Date.now()
      };

      if (role === "student") {
        userData.studentGrade = document.getElementById("auth-student-grade").value;
        userData.parentEmail = document.getElementById("auth-parent-email").value.trim().toLowerCase() || null;
        userData.parentPhone = document.getElementById("auth-parent-phone").value.trim() || null;
      } else {
        const tGrade = document.getElementById("auth-teacher-grade").value;
        userData.teacherGradeOrOccupation = tGrade;
        if (tGrade === "Other") {
          userData.teacherOtherExplanation = document.getElementById("auth-teacher-other").value.trim();
        }
      }

      await setDoc(doc(db, "users_v2", uid), userData);
      appUser = userData;
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    showAuthError(err.message || "Authentication failed. Please try again.");
    submitBtn.disabled = false;
    submitBtn.textContent = isSignUp ? "Create Account" : "Log In";
  }
});

function showAuthError(msg) {
  const errEl = document.getElementById("auth-error");
  errEl.textContent = msg;
  errEl.style.display = "block";
}

function hideAuthError() {
  const errEl = document.getElementById("auth-error");
  errEl.style.display = "none";
}

// Password Reset
document.getElementById("btn-open-forgot").addEventListener("click", () => {
  openModal("modal-forgot-pwd");
  document.getElementById("forgot-email-input").value = document.getElementById("auth-email").value;
});

document.getElementById("btn-send-reset").addEventListener("click", async () => {
  const email = document.getElementById("forgot-email-input").value.trim();
  if (!email) return alert("Please enter your email.");
  try {
    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent! Please check your inbox.");
    closeModal("modal-forgot-pwd");
  } catch (err) {
    alert("Error: " + err.message);
  }
});

// =========================================================================
// 2. Subject Tabs: Music & Academic (Teacher vs Student)
// =========================================================================
async function loadSubjectView(subject) {
  currentSubject = subject;
  const isTeacher = appUser?.role === "teacher";

  // Select the correct container and header based on subject
  const isMusic = subject === "Music";
  const container = document.getElementById(isMusic ? "music-content" : "academic-content");
  const actionBtn = document.getElementById(isMusic ? "btn-add-music-item" : "btn-add-academic-item");
  const navTitle = document.getElementById(isMusic ? "music-nav-title" : "academic-nav-title");
  const headerTitle = document.getElementById(isMusic ? "music-header-title" : "academic-header-title");

  // Update headers matching MatchApp.swift
  const titleText = isTeacher ? `${subject} Students` : `${subject} Progress`;
  if (navTitle) navTitle.textContent = titleText;
  if (headerTitle) headerTitle.textContent = titleText;

  container.innerHTML = `<div class="ios-spinner"></div>`;

  if (isTeacher) {
    actionBtn.style.display = "flex";
    actionBtn.onclick = () => openSetGoalModal(subject);

    try {
      // 1. Query goals specifically for this teacher and subject
      // (Uses teacherId to satisfy Firestore ownership rules without permission errors)
      let goalsSnap;
      try {
        goalsSnap = await getDocs(
          query(
            collection(db, "student_goals"),
            where("teacherId", "==", currentUser.uid),
            where("subject", "==", subject)
          )
        );
      } catch (scopedErr) {
        // Fallback: query by subject
        goalsSnap = await getDocs(
          query(collection(db, "student_goals"), where("subject", "==", subject))
        );
      }

      const studentMap = new Map();
      goalsSnap.forEach(d => {
        const data = d.data();
        if (data.studentId) {
          studentMap.set(data.studentId, {
            id: data.studentId,
            name: data.studentName || "Student",
            goal: { id: d.id, ...data }
          });
        }
      });

      // 2. Safe check on teacher_student_links (wrapped in try/catch)
      try {
        if (currentUser) {
          const linksSnap = await getDocs(
            query(collection(db, "teacher_student_links"), where("teacherId", "==", currentUser.uid))
          );
          linksSnap.forEach(d => {
            const data = d.data();
            // ONLY include student if explicitly tagged for this subject
            if (data.studentId && !studentMap.has(data.studentId) && data.subject === subject) {
              studentMap.set(data.studentId, {
                id: data.studentId,
                name: data.studentName || "Student",
                goal: null
              });
            }
          });
        }
      } catch (linksErr) {
        // Silently skip if teacher_student_links has no read permissions
      }

      const students = Array.from(studentMap.values()).sort((a, b) => a.name.localeCompare(b.name));

      if (students.length === 0) {
        container.innerHTML = `
          <div class="ios-empty-state">
            <div class="empty-icon">${isMusic ? "🎵" : "📖"}</div>
            <h3>No ${subject} students yet</h3>
            <p>Tap ＋ to set a ${subject} goal for a student.</p>
          </div>
        `;
      } else {
        let html = `
          <div class="ios-section">
            <div class="ios-section-header">${subject.toUpperCase()} STUDENTS</div>
            <div class="ios-card-group">
        `;
        students.forEach(s => {
          html += `
            <div class="ios-list-row" onclick='openTeacherStudentDetail(${JSON.stringify({
              subject,
              studentId: s.id,
              studentName: s.name,
              goal: s.goal
            })})'>
              <div class="row-left">
                <div class="row-icon" style="background-color: #e2e8f0; color: #64748b; font-size: 18px;">👤</div>
                <div>
                  <div class="row-title">${escapeHtml(s.name)}</div>
                  <div class="row-subtitle">${s.goal ? "🎯 " + escapeHtml(s.goal.goalText) : "No goal set yet"}</div>
                </div>
              </div>
              <div class="chevron">›</div>
            </div>
          `;
        });
        html += `</div></div>`;
        container.innerHTML = html;
      }
    } catch (e) {
      renderPermissionWarning(container, e.message);
    }
  } else {
    // Student View
    actionBtn.style.display = "none";
    try {
      const q = query(
        collection(db, "student_goals"),
        where("studentId", "==", currentUser.uid),
        where("subject", "==", subject)
      );
      const snap = await getDocs(q);
      const goals = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (goals.length === 0) {
        container.innerHTML = `
          <div class="ios-empty-state">
            <div class="empty-icon">${isMusic ? "🎵" : "📖"}</div>
            <h3>No ${subject} goals set yet</h3>
            <p>Your teacher will set your ${subject} goal here.</p>
          </div>
        `;
      } else {
        let html = `
          <div class="ios-section">
            <div class="ios-section-header">YOUR ${subject.toUpperCase()} GOALS</div>
            <div class="ios-card-group">
        `;
        goals.forEach(g => {
          html += `
            <div class="ios-list-row" onclick='openStudentProgress(${JSON.stringify(g)})'>
              <div class="row-left">
                <div>
                  <div style="font-size: 13px; font-weight: 600; color: var(--ios-blue); margin-bottom: 2px;">
                    ${g.teacherName ? "Teacher: " + escapeHtml(g.teacherName) : "Teacher Goal"}
                  </div>
                  <div class="row-title">🎯 ${escapeHtml(g.goalText)}</div>
                  ${g.notes ? `<div class="row-subtitle">${escapeHtml(g.notes)}</div>` : ""}
                </div>
              </div>
              <div class="chevron">›</div>
            </div>
          `;
        });
        html += `</div></div>`;
        container.innerHTML = html;
      }
    } catch (e) {
      renderPermissionWarning(container, e.message);
    }
  }
}

function renderPermissionWarning(container, errorMsg) {
  container.innerHTML = `
    <div class="ios-card-group" style="margin: 16px; padding: 18px; border-left: 4px solid var(--ios-red);">
      <div style="font-size: 16px; font-weight: 700; color: var(--ios-red); margin-bottom: 4px;">
        ⚠️ Firebase Permission Notice
      </div>
      <p style="font-size: 14px; color: #475569; line-height: 1.4; margin-bottom: 10px;">
        ${escapeHtml(errorMsg)}
      </p>
      <div style="font-size: 13px; color: #64748b; background: #f8fafc; padding: 10px; border-radius: 8px;">
        <strong>How to resolve:</strong> Make sure your Firebase Console Firestore Security Rules allow authenticated users to read and write <code>student_goals</code>.
      </div>
    </div>
  `;
}

// Click Handlers for Drill-down
window.openTeacherStudentDetail = function(params) {
  currentTeacherStudent = params;
  if (params.subject) currentSubject = params.subject;
  navigate("teacher-student", params);
};

window.openStudentProgress = function(goal) {
  currentStudentGoal = goal;
  if (goal.subject) currentSubject = goal.subject;
  navigate("student-progress", { goal });
};

// =========================================================================
// 3. Teacher Student Detail Screen
// =========================================================================
function renderTeacherStudentDetail(params) {
  const { subject, studentId, studentName } = params;
  currentSubject = subject || currentSubject;

  document.getElementById("teacher-student-nav-title").textContent = studentName || "Student";
  document.getElementById("btn-back-teacher-student").onclick = () => navigate(currentSubject.toLowerCase());

  document.getElementById("btn-open-add-note").onclick = () => {
    openAddNoteModal(currentSubject, studentId, studentName);
  };

  const container = document.getElementById("teacher-student-content");
  container.innerHTML = `<div class="ios-spinner"></div>`;

  clearScreenListeners();

  // Listen for active Goal
  const goalQuery = query(
    collection(db, "student_goals"),
    where("studentId", "==", studentId),
    where("subject", "==", currentSubject)
  );

  let currentGoal = null;
  const unsubGoal = onSnapshot(goalQuery, (snap) => {
    currentGoal = !snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
    loadLessons();
  }, (err) => {
    console.warn("Goal fetch error:", err);
    loadLessons();
  });
  unsubscribers.push(unsubGoal);

  // Listen for Progress Notes
  function loadLessons() {
    const lessonQuery = query(
      collection(db, "lesson_logs"),
      where("studentId", "==", studentId),
      where("subject", "==", currentSubject)
    );

    const unsubLessons = onSnapshot(lessonQuery, (snap) => {
      const lessons = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      renderUI(currentGoal, lessons);
    }, (err) => {
      console.warn("Lessons fetch error:", err);
      renderUI(currentGoal, []);
    });
    unsubscribers.push(unsubLessons);
  }

  function renderUI(goal, lessons) {
    let html = `
      <div class="ios-section">
        <div class="ios-section-header">GOAL</div>
        <div class="ios-card-group" style="padding: 16px;">
    `;

    if (goal) {
      html += `
        <div style="font-size: 12px; font-weight: 700; color: var(--ios-text-secondary); margin-bottom: 4px;">🎯 GOAL</div>
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 6px;">${escapeHtml(goal.goalText)}</div>
        ${goal.notes ? `<div style="font-size: 14px; color: var(--ios-text-secondary); margin-bottom: 10px;">${escapeHtml(goal.notes)}</div>` : ""}
        <button class="ios-btn-ghost" onclick='openEditGoalModal(${JSON.stringify(goal)})'>Edit Goal</button>
      `;
    } else {
      html += `
        <div style="color: var(--ios-text-secondary); margin-bottom: 10px;">No ${currentSubject} goal set yet for this student.</div>
        <button class="ios-btn-ghost" onclick='openSetGoalModal("${currentSubject}", "${studentId}", "${studentName}")'>Set a Goal</button>
      `;
    }

    html += `
        </div>
      </div>

      <div class="ios-section">
        <div class="ios-section-header">PROGRESS NOTES</div>
    `;

    if (lessons.length === 0) {
      html += `
        <div class="ios-card-group" style="padding: 24px; text-align: center; color: var(--ios-text-secondary);">
          No progress notes yet. Tap ＋ to add one.
        </div>
      `;
    } else {
      html += `<div class="ios-card-group">`;
      lessons.forEach(l => {
        html += `
          <div class="ios-list-row" onclick='openLessonDetail(${JSON.stringify(l)})'>
            <div class="row-left">
              <div>
                ${l.teacherName ? `<div style="font-size: 12px; font-weight: 700; color: var(--ios-blue); margin-bottom: 2px;">By ${escapeHtml(l.teacherName)}</div>` : ""}
                <div class="row-title">${escapeHtml(l.progressNote)}</div>
                <div class="row-subtitle">${formatDate(l.createdAt)}</div>
              </div>
            </div>
            <div class="chevron">›</div>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  }
}

// =========================================================================
// 4. Student Progress Screen
// =========================================================================
function renderStudentProgress(params) {
  const goal = params.goal;
  currentSubject = goal.subject || currentSubject;

  document.getElementById("student-progress-nav-title").textContent = `${currentSubject} Progress`;
  document.getElementById("btn-back-student-progress").onclick = () => navigate(currentSubject.toLowerCase());

  const container = document.getElementById("student-progress-content");
  container.innerHTML = `<div class="ios-spinner"></div>`;

  clearScreenListeners();

  const q = query(
    collection(db, "lesson_logs"),
    where("studentId", "==", goal.studentId),
    where("subject", "==", currentSubject)
  );

  const unsub = onSnapshot(q, (snap) => {
    const lessons = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    let html = `
      <div class="ios-section">
        <div class="ios-section-header">YOUR GOAL</div>
        <div class="ios-card-group" style="padding: 16px;">
          <div style="font-size: 16px; font-weight: 700; margin-bottom: 4px;">🎯 ${escapeHtml(goal.goalText)}</div>
          ${goal.teacherName ? `<div style="font-size: 13px; font-weight: 600; color: var(--ios-blue); margin-bottom: 6px;">Teacher: ${escapeHtml(goal.teacherName)}</div>` : ""}
          ${goal.notes ? `<div style="font-size: 14px; color: var(--ios-text-secondary);">${escapeHtml(goal.notes)}</div>` : ""}
        </div>
      </div>

      <div class="ios-section">
        <div class="ios-section-header">PROGRESS NOTES</div>
    `;

    if (lessons.length === 0) {
      html += `
        <div class="ios-card-group" style="padding: 24px; text-align: center; color: var(--ios-text-secondary);">
          No progress notes yet.
        </div>
      `;
    } else {
      html += `<div class="ios-card-group">`;
      lessons.forEach(l => {
        html += `
          <div class="ios-list-row" onclick='openLessonDetail(${JSON.stringify(l)}, ${JSON.stringify(goal)})'>
            <div class="row-left">
              <div>
                ${l.teacherName ? `<div style="font-size: 12px; font-weight: 700; color: var(--ios-blue); margin-bottom: 2px;">By ${escapeHtml(l.teacherName)}</div>` : ""}
                <div class="row-title">${escapeHtml(l.progressNote)}</div>
                <div class="row-subtitle">${formatDate(l.createdAt)}</div>
              </div>
            </div>
            <div class="chevron">›</div>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  }, (err) => {
    renderPermissionWarning(container, err.message);
  });
  unsubscribers.push(unsub);
}

// =========================================================================
// 5. Lesson Detail Screen & Comments
// =========================================================================
window.openLessonDetail = function(lesson, parentGoal = null) {
  currentLesson = lesson;
  navigate("lesson-detail", { lesson, goal: parentGoal });
};

function renderLessonDetail({ lesson, goal }) {
  const container = document.getElementById("lesson-detail-content");
  const backBtn = document.getElementById("btn-back-lesson-detail");
  const item = lesson || goal;

  backBtn.onclick = () => {
    if (appUser?.role === "teacher") {
      navigate("teacher-student", currentTeacherStudent);
    } else {
      navigate("student-progress", { goal: goal || currentStudentGoal });
    }
  };

  clearScreenListeners();

  const commentsQuery = query(
    collection(db, "lesson_comments"),
    where("lessonId", "==", item.id)
  );

  const unsub = onSnapshot(commentsQuery, (snap) => {
    const comments = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    let html = `
      <div class="ios-section" style="margin-left: 0; margin-right: 0;">
        <div class="ios-section-header">PROGRESS NOTE</div>
        <div class="ios-card-group" style="padding: 16px;">
          <div style="font-size: 16px; line-height: 1.4; color: #0f172a; margin-bottom: 8px;">
            ${escapeHtml(item.progressNote || item.goalText)}
          </div>
          ${item.teacherName ? `<div style="font-size: 13px; font-weight: 600; color: var(--ios-blue); margin-bottom: 2px;">By ${escapeHtml(item.teacherName)}</div>` : ""}
          <div style="font-size: 12px; color: var(--ios-text-secondary);">${formatDate(item.createdAt)}</div>
        </div>
      </div>
    `;

    if (item.notes) {
      html += `
        <div class="ios-section" style="margin-left: 0; margin-right: 0;">
          <div class="ios-section-header">NOTES</div>
          <div class="ios-card-group" style="padding: 16px; font-size: 14px; color: #475569;">
            ${escapeHtml(item.notes)}
          </div>
        </div>
      `;
    }

    html += `
      <div class="ios-section" style="margin-left: 0; margin-right: 0;">
        <div class="ios-section-header">COMMENTS</div>
    `;

    if (comments.length === 0) {
      html += `
        <div class="ios-card-group" style="padding: 20px; text-align: center; color: var(--ios-text-secondary); font-size: 14px;">
          No comments yet.
        </div>
      `;
    } else {
      comments.forEach(c => {
        html += `
          <div class="ios-card-group" style="padding: 14px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 13px; font-weight: 700; color: #1e293b;">${escapeHtml(c.authorName || "User")}</span>
              <span style="font-size: 11px; color: var(--ios-text-secondary);">${formatDate(c.createdAt)}</span>
            </div>
            <div style="font-size: 14px; color: #334155; line-height: 1.4;">${escapeHtml(c.text)}</div>
          </div>
        `;
      });
    }

    html += `</div>`;
    container.innerHTML = html;
  }, (err) => {
    console.warn("Comments fetch error:", err);
  });
  unsubscribers.push(unsub);
}

document.getElementById("btn-send-lesson-comment").addEventListener("click", async () => {
  const input = document.getElementById("lesson-comment-input");
  const text = input.value.trim();
  if (!text || !currentLesson?.id || !currentUser) return;

  try {
    input.value = "";
    await addDoc(collection(db, "lesson_comments"), {
      lessonId: currentLesson.id,
      authorId: currentUser.uid,
      authorName: appUser?.name || currentUser.displayName || currentUser.email || "User",
      text,
      createdAt: Date.now()
    });
  } catch (e) {
    alert("Could not post comment: " + e.message);
  }
});

// =========================================================================
// 6. Direct Messages & Chat
// =========================================================================
async function loadChatInbox() {
  const container = document.getElementById("chat-inbox-content");
  container.innerHTML = `<div class="ios-spinner"></div>`;

  try {
    const usersSnap = await getDocs(collection(db, "users_v2"));
    const otherUsers = usersSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => u.id !== currentUser.uid);

    if (otherUsers.length === 0) {
      container.innerHTML = `
        <div class="ios-empty-state">
          <div class="empty-icon">💬</div>
          <h3>No conversations yet</h3>
          <p>Tap "✏️ New" to start a direct message with a teacher or student.</p>
        </div>
      `;
      return;
    }

    let html = `
      <div class="ios-section">
        <div class="ios-section-header">CONVERSATIONS</div>
        <div class="ios-card-group">
    `;

    otherUsers.forEach(user => {
      const threadId = [currentUser.uid, user.id].sort().join("__");
      html += `
        <div class="ios-list-row" onclick='openDMThread(${JSON.stringify({ otherId: user.id, otherName: user.name || user.email, otherRole: user.role, threadId })})'>
          <div class="row-left">
            <div class="row-icon" style="background-color: ${user.role === "teacher" ? "var(--ios-purple)" : "var(--ios-blue)"};">
              ${user.role === "teacher" ? "🎓" : "🎒"}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="row-title">${escapeHtml(user.name || user.email)}</span>
                <span class="role-badge ${user.role}">${escapeHtml(user.role || "User")}</span>
              </div>
              <div class="row-subtitle">Tap to chat</div>
            </div>
          </div>
          <div class="chevron">›</div>
        </div>
      `;
    });

    html += `</div></div>`;
    container.innerHTML = html;
  } catch (e) {
    renderPermissionWarning(container, e.message);
  }
}

window.openDMThread = function(params) {
  currentChatThread = params;
  navigate("dm-thread", params);
};

function renderDMThread(params) {
  const { otherId, otherName, otherRole, threadId } = params;
  document.getElementById("dm-thread-title").textContent = otherName || "Chat";
  const messagesContainer = document.getElementById("dm-messages-container");
  messagesContainer.innerHTML = `<div class="ios-spinner"></div>`;

  clearScreenListeners();

  const tid = threadId || [currentUser.uid, otherId].sort().join("__");
  const q = query(
    collection(db, "dm_threads", tid, "messages"),
    orderBy("sentAt", "asc")
  );

  const unsub = onSnapshot(q, (snap) => {
    messagesContainer.innerHTML = "";
    if (snap.empty) {
      messagesContainer.innerHTML = `
        <div style="text-align: center; color: var(--ios-text-secondary); margin-top: 40px; font-size: 14px;">
          Start the conversation with ${escapeHtml(otherName)}!
        </div>
      `;
      return;
    }

    snap.docs.forEach(docSnap => {
      const msg = docSnap.data();
      const isMe = msg.senderId === currentUser.uid;
      const bubble = document.createElement("div");
      bubble.className = `chat-bubble ${isMe ? "sent" : "received"}`;
      bubble.innerHTML = `
        <div class="bubble-author">${escapeHtml(isMe ? "You" : msg.senderName || otherName)}</div>
        <div>${escapeHtml(msg.text)}</div>
        <div class="bubble-time">${formatTime(msg.sentAt)}</div>
      `;
      messagesContainer.appendChild(bubble);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, (err) => {
    messagesContainer.innerHTML = `<p style="padding: 16px; color: var(--ios-red);">Chat error: ${err.message}</p>`;
  });
  unsubscribers.push(unsub);
}

document.getElementById("btn-send-dm").addEventListener("click", sendDMMessage);
document.getElementById("dm-message-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendDMMessage();
});

async function sendDMMessage() {
  const input = document.getElementById("dm-message-input");
  const text = input.value.trim();
  if (!text || !currentUser || !currentChatThread) return;

  const tid = currentChatThread.threadId || [currentUser.uid, currentChatThread.otherId].sort().join("__");
  input.value = "";

  try {
    await addDoc(collection(db, "dm_threads", tid, "messages"), {
      senderId: currentUser.uid,
      senderName: appUser?.name || currentUser.displayName || currentUser.email || "Me",
      text,
      sentAt: Date.now()
    });
  } catch (e) {
    alert("Could not send message: " + e.message);
  }
}

// User Picker Modal for New DM
document.getElementById("btn-new-dm").addEventListener("click", async () => {
  openModal("modal-new-dm");
  loadUsersForNewDM("teachers");
});

document.querySelectorAll("#dm-picker-segmented .segmented-option").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#dm-picker-segmented .segmented-option").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    loadUsersForNewDM(btn.dataset.tab);
  });
});

async function loadUsersForNewDM(tab) {
  const listEl = document.getElementById("dm-user-list");
  listEl.innerHTML = `<div class="ios-spinner"></div>`;

  try {
    const roleTarget = tab === "teachers" ? "teacher" : "student";
    const snap = await getDocs(
      query(collection(db, "users_v2"), where("role", "==", roleTarget))
    );
    const users = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => u.id !== currentUser.uid);

    if (users.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; color: var(--ios-text-secondary); padding: 24px;">No ${tab} found.</div>`;
      return;
    }

    let html = `<div class="ios-card-group">`;
    users.forEach(u => {
      html += `
        <div class="ios-list-row" onclick='startChatFromPicker(${JSON.stringify({
          otherId: u.id,
          otherName: u.name || u.email,
          otherRole: u.role
        })})'>
          <div class="row-left">
            <div class="row-icon" style="background-color: #e2e8f0; color: #475569;">👤</div>
            <div>
              <div class="row-title">${escapeHtml(u.name || u.email)}</div>
              <div class="row-subtitle">${escapeHtml(u.email)}</div>
            </div>
          </div>
          <div class="chevron">›</div>
        </div>
      `;
    });
    html += `</div>`;
    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = `<p style="color: var(--ios-red); padding: 16px;">${e.message}</p>`;
  }
}

window.startChatFromPicker = function(user) {
  closeModal("modal-new-dm");
  openDMThread(user);
};

// =========================================================================
// 7. Modals: Set Goal & Add Note
// =========================================================================
window.openSetGoalModal = async function(subject, preselectedStudentId = null, preselectedStudentName = null) {
  currentSubject = subject || currentSubject;
  editingGoalId = null;

  openModal("modal-set-goal");
  document.getElementById("goal-sheet-title").textContent = `Set ${currentSubject} Goal`;
  document.getElementById("goal-text-input").value = "";
  document.getElementById("goal-notes-input").value = "";

  const selectGroup = document.getElementById("goal-student-select-group");
  const select = document.getElementById("goal-student-select");

  if (preselectedStudentId) {
    selectGroup.style.display = "none";
    select.innerHTML = `<option value="${preselectedStudentId}" selected>${escapeHtml(preselectedStudentName)}</option>`;
  } else {
    selectGroup.style.display = "block";
    select.innerHTML = `<option value="">Loading students…</option>`;

    try {
      const snap = await getDocs(query(collection(db, "users_v2"), where("role", "==", "student")));
      let options = `<option value="">Choose student…</option>`;
      snap.docs.forEach(d => {
        const u = d.data();
        options += `<option value="${d.id}">${escapeHtml(u.name || u.email)}</option>`;
      });
      select.innerHTML = options;
    } catch (err) {
      console.warn("Could not list candidate students:", err);
      select.innerHTML = `<option value="">Select student (permissions restricted)</option>`;
    }
  }
};

window.openEditGoalModal = function(goal) {
  if (goal?.subject) currentSubject = goal.subject;
  editingGoalId = goal.id;

  openModal("modal-set-goal");
  document.getElementById("goal-sheet-title").textContent = `Edit ${currentSubject} Goal`;
  document.getElementById("goal-student-select-group").style.display = "none";
  document.getElementById("goal-text-input").value = goal.goalText || "";
  document.getElementById("goal-notes-input").value = goal.notes || "";
};

document.getElementById("btn-save-goal").addEventListener("click", async () => {
  const goalText = document.getElementById("goal-text-input").value.trim();
  const notes = document.getElementById("goal-notes-input").value.trim();
  const studentSelect = document.getElementById("goal-student-select");
  const studentId = studentSelect ? studentSelect.value : currentTeacherStudent?.studentId;
  const studentName = studentSelect?.selectedOptions[0]?.textContent || currentTeacherStudent?.studentName || "Student";

  if (!goalText) return alert("Please enter a goal description.");
  if (!studentId) return alert("Please select a student.");

  try {
    const docId = editingGoalId || `${currentUser.uid}_${studentId}_${currentSubject}`;
    await setDoc(doc(db, "student_goals", docId), {
      teacherId: currentUser.uid,
      teacherName: appUser?.name || currentUser.displayName || "Teacher",
      studentId,
      studentName,
      subject: currentSubject,
      goalText,
      notes,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }, { merge: true });

    closeModal("modal-set-goal");
    loadSubjectView(currentSubject);
  } catch (e) {
    alert("Could not save goal: " + e.message);
  }
});

window.openAddNoteModal = function(subject, studentId, studentName) {
  currentSubject = subject || currentSubject;
  openModal("modal-add-note");
  document.getElementById("note-author-input").value = appUser?.name || currentUser.displayName || "Teacher";
  document.getElementById("note-progress-input").value = "";
  document.getElementById("note-notes-input").value = "";
};

document.getElementById("btn-save-note").addEventListener("click", async () => {
  const authorName = document.getElementById("note-author-input").value.trim();
  const progressNote = document.getElementById("note-progress-input").value.trim();
  const notes = document.getElementById("note-notes-input").value.trim();

  if (!authorName || !progressNote) return alert("Please fill in required fields.");
  if (!currentTeacherStudent) return;

  const noteSubject = currentTeacherStudent.subject || currentSubject;

  try {
    await addDoc(collection(db, "lesson_logs"), {
      teacherId: currentUser.uid,
      teacherName: authorName,
      studentId: currentTeacherStudent.studentId,
      studentName: currentTeacherStudent.studentName,
      subject: noteSubject,
      progressNote,
      notes,
      createdAt: Date.now()
    });

    closeModal("modal-add-note");
  } catch (e) {
    alert("Could not save note: " + e.message);
  }
});

// =========================================================================
// 8. More & Account Screens
// =========================================================================
function renderMoreScreen() {
  // Static rows in HTML
}

function renderAccountScreen() {
  document.getElementById("account-name").textContent = appUser?.name || "User";
  document.getElementById("account-role").textContent = appUser?.role ? appUser.role.charAt(0).toUpperCase() + appUser.role.slice(1) : "Student";
  document.getElementById("account-email").textContent = appUser?.email || currentUser?.email || "";

  const extraContainer = document.getElementById("account-extra-info");
  let extraHtml = "";

  if (appUser?.gender) {
    extraHtml += `
      <div style="margin-bottom: 12px;">
        <span class="ios-label">Gender</span>
        <div style="font-size: 16px; font-weight: 600;">${escapeHtml(appUser.gender)}</div>
      </div>
    `;
  }
  if (appUser?.studentGrade) {
    extraHtml += `
      <div style="margin-bottom: 12px;">
        <span class="ios-label">Grade</span>
        <div style="font-size: 16px; font-weight: 600;">Grade ${escapeHtml(appUser.studentGrade)}</div>
      </div>
    `;
  }
  if (appUser?.teacherGradeOrOccupation) {
    extraHtml += `
      <div style="margin-bottom: 12px;">
        <span class="ios-label">Grade / Occupation</span>
        <div style="font-size: 16px; font-weight: 600;">${escapeHtml(appUser.teacherGradeOrOccupation)}</div>
      </div>
    `;
  }
  extraContainer.innerHTML = extraHtml;
}

document.getElementById("btn-sign-out").addEventListener("click", async () => {
  if (confirm("Are you sure you want to sign out?")) {
    await signOut(auth);
  }
});

document.getElementById("btn-delete-account").addEventListener("click", () => {
  window.location.href = "mailto:360viewofmypeers@gmail.com?subject=Delete%20my%20account";
});

// Bottom Tab Bar Navigation
document.querySelectorAll("#tab-bar .tab-item").forEach(item => {
  item.addEventListener("click", () => {
    navigate(item.dataset.tab);
  });
});

// =========================================================================
// Modal Helpers
// =========================================================================
window.openModal = function(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add("open");
};

window.closeModal = function(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove("open");
};

// =========================================================================
// Utility Functions
// =========================================================================
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  const t = typeof timestamp === "number" && timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  const t = typeof timestamp === "number" && timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function updateClock() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeStr = `${hours % 12 || 12}:${minutes < 10 ? '0' : ''}${minutes}`;
  const clockEl = document.getElementById("status-clock");
  if (clockEl) clockEl.textContent = timeStr;
}
setInterval(updateClock, 10000);
updateClock();

// Toggle Desktop Phone Bezel View
document.getElementById("toggle-frame-btn").addEventListener("click", () => {
  const isFull = document.body.classList.toggle("full-screen-mode");
  document.getElementById("toggle-frame-btn").textContent = isFull ? "📱 Phone View" : "🖥️ Full Screen";
});
