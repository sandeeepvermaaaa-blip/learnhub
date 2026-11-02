const $ = (s) => document.querySelector(s);
let currentUser = null;
let authMode = "login";
const icons = ["📘","💻","📐","🎯","🧠","🌱"];

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function openAuth(mode) {
  authMode = mode; $("#authModal").classList.remove("hidden");
  $("#authTitle").textContent = mode === "login" ? "Welcome back" : "Create your account";
  $("#authSubmit").textContent = mode === "login" ? "Log in" : "Create account";
  $("#nameField").classList.toggle("hidden", mode === "login");
  $("#nameField input").required = mode === "signup";
  $("#authSwitch").innerHTML = mode === "login"
    ? 'New here? <button type="button" data-switch="signup">Create an account</button>'
    : 'Already have an account? <button type="button" data-switch="login">Log in</button>';
  $("#authStatus").textContent = ""; $("#authForm").reset();
}
document.addEventListener("click", e => {
  const auth = e.target.closest("[data-open-auth]");
  if (auth) openAuth(auth.dataset.openAuth);
  const sw = e.target.closest("[data-switch]");
  if (sw) openAuth(sw.dataset.switch);
  const enroll = e.target.closest("[data-enroll]");
  if (enroll) enrollCourse(enroll.dataset.enroll);
  const tab = e.target.closest("[data-profile-tab]");
  if (tab) renderProfileTab(tab.dataset.profileTab);
  const del = e.target.closest("[data-delete-course]");
  if (del) deleteCourse(del.dataset.deleteCourse);
  const read = e.target.closest("[data-read-message]");
  if (read) markMessageRead(read.dataset.readMessage);
});
$("#closeModal").addEventListener("click", () => $("#authModal").classList.add("hidden"));
$("#authModal").addEventListener("click", e => { if (e.target.id === "authModal") $("#authModal").classList.add("hidden"); });
$("#closeProfile").addEventListener("click", () => $("#profileModal").classList.add("hidden"));
$("#profileModal").addEventListener("click", e => { if (e.target.id === "profileModal") $("#profileModal").classList.add("hidden"); });

$("#authForm").addEventListener("submit", async e => {
  e.preventDefault(); const form = new FormData(e.currentTarget);
  const body = Object.fromEntries(form.entries());
  $("#authSubmit").disabled = true; $("#authStatus").textContent = "Please wait…";
  try {
    const data = await api(authMode === "login" ? "/api/auth/login" : "/api/auth/signup", { method:"POST", body:JSON.stringify(body) });
    currentUser = data.user; $("#authModal").classList.add("hidden"); updateAccount(); toast("Welcome, " + currentUser.name + "!"); await loadCourses();
  } catch (err) { $("#authStatus").textContent = err.message; }
  finally { $("#authSubmit").disabled = false; }
});

function updateAccount() {
  const area = $("#accountArea");
  if (!currentUser) {
    area.innerHTML = '<button class="btn btn-light" data-open-auth="login">Log in</button><button class="btn btn-primary" data-open-auth="signup">Sign up</button>';
    return;
  }
  area.innerHTML = `<button class="btn btn-light" id="profileButton">${escapeHtml(currentUser.name.split(" ")[0])} · My space</button><button class="btn btn-primary" id="logoutButton">Log out</button>`;
  $("#profileButton").addEventListener("click", openProfile);
  $("#logoutButton").addEventListener("click", logout);
}
async function logout() {
  try { await api("/api/auth/logout", { method:"POST", body:"{}" }); } catch {}
  currentUser = null; updateAccount(); toast("You have logged out.");
  await loadCourses();
}
async function loadCourses() {
  try {
    const { courses } = await api("/api/courses");
    $("#courseGrid").innerHTML = courses.map((c,i) => `
      <article class="course-card">
        <div class="course-icon">${icons[i % icons.length]}</div>
        <div class="eyebrow">${escapeHtml(c.category)} · ${escapeHtml(c.level)}</div>
        <h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.description)}</p>
        <div class="course-meta">${c.students} learner${c.students === 1 ? "" : "s"}</div>
        <button class="btn btn-primary" data-enroll="${c.id}">${currentUser ? "Enroll now ↗" : "Log in to enroll"}</button>
      </article>`).join("") || '<p>No courses yet. Check back soon.</p>';
  } catch (err) { $("#courseGrid").innerHTML = `<p>${escapeHtml(err.message)}</p>`; }
}
async function enrollCourse(id) {
  if (!currentUser) return openAuth("login");
  try { const data = await api(`/api/courses/${id}/enroll`, { method:"POST", body:"{}" }); toast(data.message); }
  catch (err) { toast(err.message); }
}
async function openProfile() {
  $("#profileModal").classList.remove("hidden");
  $("#profileContent").innerHTML = '<div class="loading">Loading your profile…</div>';
  renderProfileTab("profile");
}
async function renderProfileTab(tab) {
  document.querySelectorAll("[data-profile-tab]").forEach(b => b.classList.toggle("active", b.dataset.profileTab === tab));
  const root = $("#profileContent");
  if (!currentUser) return;
  const tabs = `<div class="profile-top"><div class="avatar">${escapeHtml(currentUser.name.charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(currentUser.name)}</strong><small>${escapeHtml(currentUser.email)} · ${escapeHtml(currentUser.role)}</small></div></div>
  <div class="profile-tabs"><button data-profile-tab="profile" class="${tab==="profile"?"active":""}">Profile</button><button data-profile-tab="courses" class="${tab==="courses"?"active":""}">My courses</button>${currentUser.role==="admin"?'<button data-profile-tab="admin" class="'+(tab==="admin"?"active":"")+'">Admin dashboard</button>':""}</div>`;
  try {
    if (tab === "profile") {
      root.innerHTML = tabs + `<form id="profileForm"><label>Name<input name="name" required minlength="2" maxlength="70" value="${escapeHtml(currentUser.name)}"></label><label>Email<input value="${escapeHtml(currentUser.email)}" disabled></label><label>About me<textarea name="bio" maxlength="280" rows="3" placeholder="Tell us a little about yourself">${escapeHtml(currentUser.bio || "")}</textarea></label><button class="btn btn-primary">Save profile</button><p class="form-status" id="profileStatus"></p></form>`;
      $("#profileForm").addEventListener("submit", saveProfile);
    } else if (tab === "courses") {
      const {courses} = await api("/api/my-courses");
      root.innerHTML = tabs + (courses.length ? courses.map(c=>`<div class="admin-form"><strong>${escapeHtml(c.title)}</strong><p>${escapeHtml(c.category)} · ${escapeHtml(c.level)}</p></div>`).join("") : "<p>You have not enrolled in any courses yet. Explore the course library to get started.</p>");
    } else if (tab === "admin" && currentUser.role === "admin") {
      const [stats, users, messages, courses] = await Promise.all([
        api("/api/admin/overview"), api("/api/admin/users"), api("/api/admin/messages"), api("/api/courses")
      ]);
      root.innerHTML = tabs + `<div class="admin-stats"><div class="admin-stat"><b>${stats.users}</b><small>Users</small></div><div class="admin-stat"><b>${stats.courses}</b><small>Courses</small></div><div class="admin-stat"><b>${stats.enrollments}</b><small>Enrollments</small></div><div class="admin-stat"><b>${stats.unread}</b><small>Unread messages</small></div></div>
      <h3>Manage courses</h3><form id="newCourseForm" class="admin-form"><label>Course title<input name="title" required minlength="3" maxlength="100"></label><label>Description<textarea name="description" required minlength="10" maxlength="600" rows="2"></textarea></label><div class="form-row"><label>Category<input name="category" value="General" maxlength="50"></label><label>Level<input name="level" value="Beginner" maxlength="30"></label></div><button class="btn btn-primary">Add course</button></form>
      <table class="data-table"><thead><tr><th>Course</th><th>Action</th></tr></thead><tbody>${courses.courses.map(c=>`<tr><td>${escapeHtml(c.title)}</td><td><button class="btn btn-light" data-delete-course="${c.id}">Delete</button></td></tr>`).join("")}</tbody></table>
      <h3>Users (${users.users.length})</h3><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>${users.users.map(u=>`<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.role)}</td></tr>`).join("")}</tbody></table>
      <h3>Contact messages</h3>${messages.messages.length ? messages.messages.map(m=>`<div class="admin-form"><strong>${escapeHtml(m.subject)}</strong> ${m.is_read?"· Read":"· New"}<p>${escapeHtml(m.name)} (${escapeHtml(m.email)})</p><p>${escapeHtml(m.message)}</p>${m.is_read?"":`<button class="btn btn-light" data-read-message="${m.id}">Mark as read</button>`}</div>`).join("") : "<p>No messages yet.</p>"}`;
      $("#newCourseForm").addEventListener("submit", createCourse);
    }
  } catch (err) { root.innerHTML = tabs + `<p class="form-status">${escapeHtml(err.message)}</p>`; }
}
async function saveProfile(e) {
  e.preventDefault(); const body = Object.fromEntries(new FormData(e.currentTarget).entries());
  try { const data = await api("/api/profile",{method:"PATCH",body:JSON.stringify(body)}); currentUser=data.user; toast("Profile saved."); updateAccount(); renderProfileTab("profile"); }
  catch(err){ $("#profileStatus").textContent=err.message; }
}
async function createCourse(e) {
  e.preventDefault(); const body=Object.fromEntries(new FormData(e.currentTarget).entries());
  try { await api("/api/admin/courses",{method:"POST",body:JSON.stringify(body)}); toast("Course added."); await loadCourses(); renderProfileTab("admin"); }
  catch(err){ toast(err.message); }
}
async function deleteCourse(id) {
  if (!confirm("Delete this course and its enrollments?")) return;
  try { await api(`/api/admin/courses/${id}`,{method:"DELETE"}); toast("Course deleted."); await loadCourses(); renderProfileTab("admin"); }
  catch(err){ toast(err.message); }
}
async function markMessageRead(id) {
  try { await api(`/api/admin/messages/${id}/read`,{method:"PATCH",body:"{}"}); renderProfileTab("admin"); }
  catch(err){ toast(err.message); }
}
$("#contactForm").addEventListener("submit", async e => {
  e.preventDefault(); const body=Object.fromEntries(new FormData(e.currentTarget).entries());
  $("#contactStatus").textContent="Sending…";
  try { const data=await api("/api/contact",{method:"POST",body:JSON.stringify(body)}); $("#contactStatus").textContent=data.message; e.currentTarget.reset(); }
  catch(err){ $("#contactStatus").textContent=err.message; }
});
async function init() {
  $("#year").textContent = new Date().getFullYear();
  try { const data=await api("/api/me"); currentUser=data.user; } catch { currentUser=null; }
  updateAccount(); await loadCourses();
}
init();
