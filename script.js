const STORAGE_KEY = "mindful-journal-garden-v2";
const CLOUD_TABLE = "user_journal_state";

const inspirations = [
  { text: '"And now that you don\'t have to be perfect, you can be good."', source: "John Steinbeck, East of Eden" },
  { text: '"I am rooted, but I flow."', source: "Virginia Woolf, The Waves" },
  { text: '"There was another life that I might have had, but I am having this one."', source: "Kazuo Ishiguro, Never Let Me Go" },
  { text: '"I took a deep breath and listened to the old brag of my heart: I am, I am, I am."', source: "Sylvia Plath, The Bell Jar" },
];

const notePrompts = [
  "Whisper something to your universe...",
  "Add a little spark to your galaxy...",
  "What’s blooming in your world today?",
];

const moodRangeSteps = [
  { emoji: "😞", label: "Sad" },
  { emoji: "😐", label: "Neutral" },
  { emoji: "😊", label: "Happy" },
  { emoji: "🤩", label: "Excited" },
];

const completionMessages = [
  "A tiny win for today. You’re doing beautifully.",
  "Done and glowing. Keep going softly.",
  "A sweet little checkmark for your universe.",
  "You showed up for yourself today.",
];

const tagMeta = {
  Health: { icon: "🫀", className: "tag-health" },
  Wellbeing: { icon: "🌼", className: "tag-wellbeing" },
  Mindfulness: { icon: "🧘", className: "tag-mindfulness" },
  Focus: { icon: "🎯", className: "tag-focus" },
  Creativity: { icon: "🎨", className: "tag-creativity" },
  Rest: { icon: "☁️", className: "tag-rest" },
};

const defaultData = {
  profile: { preferredName: "" },
  tasks: [
    {
      id: crypto.randomUUID(),
      title: "Morning stretch and tea",
      tag: "Health",
      targetDate: null,
      detail: "Ten gentle minutes, then write one kind sentence to yourself.",
      assignedDates: [],
      completedDates: [],
    },
    {
      id: crypto.randomUUID(),
      title: "Read 8 pages",
      tag: "Mindfulness",
      targetDate: null,
      detail: "Bring one sentence from reading into today's notes.",
      assignedDates: [],
      completedDates: [],
    },
    {
      id: crypto.randomUUID(),
      title: "Walk with a favorite playlist",
      tag: "Wellbeing",
      targetDate: null,
      detail: "Notice three pleasant things outdoors.",
      assignedDates: [],
      completedDates: [],
    },
  ],
  entries: {},
};

let state = structuredClone(defaultData);
let viewingDate = new Date();
let selectedDateKey = toDateKey(new Date());
let inspirationIndex = Math.floor(Math.random() * inspirations.length);
let draggedTaskId = null;
let dragGhost = null;
let highlightedDateKey = null;
let selectedTaskForMobile = null;
let currentUser = null;
let supabaseClient = null;
let cloudReady = false;
let hasRenderedApp = false;
let saveTimeoutId = null;

const authShell = document.getElementById("auth-shell");
const authPreferredNameInput = document.getElementById("auth-preferred-name");
const authEmailInput = document.getElementById("auth-email");
const authPasswordInput = document.getElementById("auth-password");
const authMessage = document.getElementById("auth-message");
const signInButton = document.getElementById("sign-in-button");
const signUpButton = document.getElementById("sign-up-button");
const signOutButton = document.getElementById("sign-out-button");
const accountEmail = document.getElementById("account-email");

const monthLabel = document.getElementById("month-label");
const calendarGrid = document.getElementById("calendar-grid");
const calendarDayDetail = document.getElementById("calendar-day-detail");
const selectedDateLabel = document.getElementById("selected-date-label");
const heroGreeting = document.getElementById("hero-greeting");
const heroMessage = document.getElementById("hero-message");
const moodRange = document.getElementById("mood-range");
const moodRangeEmoji = document.getElementById("mood-range-emoji");
const moodRangeValue = document.getElementById("mood-range-value");
const hydrationRange = document.getElementById("hydration-range");
const hydrationRangeValue = document.getElementById("hydration-range-value");
const richEditor = document.getElementById("rich-editor");
const dayTaskList = document.getElementById("day-task-list");
const taskDrawer = document.getElementById("task-drawer");
const toggleDrawerButton = document.getElementById("toggle-drawer");
const taskSearch = document.getElementById("task-search");
const trackerItems = document.getElementById("tracker-items");
const completionStat = document.getElementById("completion-stat");
const completionLabel = document.getElementById("completion-label");
const taskTemplate = document.getElementById("task-card-template");
const cursorAura = document.querySelector(".cursor-aura");
const feedbackBubble = document.getElementById("feedback-bubble");
const mobileSections = document.getElementById("mobile-sections");
const mobileNavButtons = Array.from(document.querySelectorAll(".mobile-nav-button"));

const config = window.APP_CONFIG || {};

boot();

async function boot() {
  initializeClient();
  wireGlobalEvents();
  renderInspiration();
  renderApp();

  if (!cloudReady) {
    authMessage.textContent = "";
    accountEmail.textContent = "Setup needed";
    authShell.classList.add("visible");
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) authMessage.textContent = error.message;
  currentUser = data?.session?.user || null;
  await loadUserState();
  applyAuthState();

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    await loadUserState();
    applyAuthState();
  });
}

function initializeClient() {
  if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) {
    cloudReady = false;
    return;
  }
  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  cloudReady = true;
}

function wireGlobalEvents() {
  signInButton.addEventListener("click", () => handleAuth("sign-in"));
  signUpButton.addEventListener("click", () => handleAuth("sign-up"));
  signOutButton.addEventListener("click", handleSignOut);

  document.getElementById("jump-today").addEventListener("click", () => {
    const today = new Date();
    viewingDate = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedDateKey = toDateKey(today);
    renderCalendar();
    renderSelectedDay();
    renderCalendarDayDetail();
    if (isMobileLike()) {
      const target = mobileSections.querySelector('[data-panel-name="calendar-panel"]');
      target?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      syncMobileNav("calendar-panel");
    }
  });

  document.getElementById("prev-month").addEventListener("click", () => {
    viewingDate = new Date(viewingDate.getFullYear(), viewingDate.getMonth() - 1, 1);
    renderCalendar();
  });

  document.getElementById("next-month").addEventListener("click", () => {
    viewingDate = new Date(viewingDate.getFullYear(), viewingDate.getMonth() + 1, 1);
    renderCalendar();
  });

  document.getElementById("save-entry").addEventListener("click", async () => {
    writeCurrentEditorToState();
    await persist();
    renderCalendar();
    renderSelectedDay();
    celebrate("Day notes saved");
  });

  document.getElementById("clear-day").addEventListener("click", async () => {
    const entry = getCurrentEntry();
    entry.title = "";
    entry.content = "";
    entry.wellbeing = getEmptyWellbeing();
    await persist();
    renderCalendar();
    renderSelectedDay();
  });

  document.querySelectorAll(".toolbar-button[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      richEditor.focus();
      document.execCommand(button.dataset.command, false);
      queueSave();
    });
  });

  document.getElementById("insert-link").addEventListener("click", () => {
    const url = window.prompt("Paste a link to add:");
    if (!url) return;
    richEditor.focus();
    document.execCommand("createLink", false, url);
    queueSave();
  });

  document.getElementById("add-task").addEventListener("click", addTask);
  toggleDrawerButton.addEventListener("click", () => {
    taskDrawer.classList.toggle("collapsed");
    syncDrawerButton();
  });
  taskSearch.addEventListener("input", renderTasks);
  document.getElementById("task-title").addEventListener("keydown", (event) => {
    if (event.key === "Enter") addTask();
  });

  richEditor.addEventListener("input", queueSave);
  moodRange.addEventListener("input", handleWellbeingInput);
  hydrationRange.addEventListener("input", handleWellbeingInput);

  document.addEventListener("mousemove", (event) => {
    cursorAura.style.left = `${event.clientX}px`;
    cursorAura.style.top = `${event.clientY}px`;
    updatePointerDrag(event.clientX, event.clientY);
  });
  document.addEventListener("mousedown", () => {
    cursorAura.style.transform = "translate(-50%, -50%) scale(0.8)";
  });
  document.addEventListener("mouseup", () => {
    cursorAura.style.transform = "translate(-50%, -50%) scale(1)";
    finishPointerDrag();
  });
  document.addEventListener("touchmove", (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    updatePointerDrag(touch.clientX, touch.clientY);
  }, { passive: true });
  document.addEventListener("touchend", finishPointerDrag);

  mobileNavButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = mobileSections.querySelector(`[data-panel-name="${button.dataset.panelTarget}"]`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      syncMobileNav(button.dataset.panelTarget);
    });
  });

  mobileSections.addEventListener("scroll", debounce(syncMobileNavToScroll, 60));
}

async function handleAuth(mode) {
  if (!cloudReady) {
    authMessage.textContent = "Account login isn't connected yet. Add your Supabase keys in app-config.js first.";
    return;
  }
  const preferredName = authPreferredNameInput.value.trim();
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value.trim();
  if (!email || !password) {
    authMessage.textContent = "Enter both email and password.";
    return;
  }

  authMessage.textContent = mode === "sign-up" ? "Creating account..." : "Signing in...";

  try {
    const { data, error } = mode === "sign-up"
      ? await supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { preferred_name: preferredName || "" } },
        })
      : await supabaseClient.auth.signInWithPassword({ email, password });

    if (!error && preferredName) {
      state.profile.preferredName = preferredName;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeState(state)));
    }
    if (!error && mode === "sign-in" && preferredName) {
      const { data: updatedUserData } = await supabaseClient.auth.updateUser({ data: { preferred_name: preferredName } });
      if (updatedUserData?.user) currentUser = updatedUserData.user;
    } else if (!error && data?.user) {
      currentUser = data.user;
    }

    authMessage.textContent = error
      ? error.message
      : mode === "sign-up"
        ? "Account created. Check your email if confirmation is enabled, then sign in."
        : "Signed in.";
  } catch (error) {
    authMessage.textContent = "Unable to reach Supabase. Check your project URL/key and try again.";
    console.error(error);
  }
}

async function handleSignOut() {
  if (!cloudReady) return;
  await supabaseClient.auth.signOut();
}

function applyAuthState() {
  updateGreeting();
  if (currentUser) {
    authShell.classList.remove("visible");
    accountEmail.textContent = getPreferredName() || "Signed in";
    if (isMobileLike()) {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        ensureMobileCalendarLanding();
      });
    }
    return;
  }
  authShell.classList.add("visible");
  accountEmail.textContent = cloudReady ? "Signed out" : "Setup needed";
}

async function loadUserState() {
  if (!currentUser) {
    state = loadLocalCache();
    normalizeTasks();
    renderApp();
    return;
  }

  const { data, error } = await supabaseClient.from(CLOUD_TABLE).select("app_state").eq("user_id", currentUser.id).maybeSingle();

  if (error) {
    authMessage.textContent = `Cloud load failed: ${error.message}`;
    state = loadLocalCache();
  } else if (data?.app_state) {
    state = sanitizeState(data.app_state);
  } else {
    state = loadLocalCache();
    await saveCloudState();
  }

  const authPreferredName = currentUser?.user_metadata?.preferred_name || "";
  if (!state.profile.preferredName && authPreferredName) {
    state.profile.preferredName = authPreferredName;
    await saveCloudState();
  }

  normalizeTasks();
  renderApp();
}

function renderApp() {
  selectedDateKey = selectedDateKey || toDateKey(new Date());
  viewingDate = viewingDate || new Date();
  if (!hasRenderedApp) hasRenderedApp = true;
  renderInspiration();
  renderCalendar();
  renderSelectedDay();
  renderTasks();
  renderTracker();
  syncDrawerButton();
  updateGreeting();
  ensureMobileCalendarLanding();
}

function renderInspiration() {
  const item = inspirations[inspirationIndex % inspirations.length];
  heroMessage.textContent = `Today's quote: ${item.text}  •  ${item.source}`;
}

function renderCalendar() {
  calendarGrid.innerHTML = "";
  monthLabel.textContent = viewingDate.toLocaleString("en-US", { month: "long", year: "numeric" });

  const year = viewingDate.getFullYear();
  const month = viewingDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const todayKey = toDateKey(new Date());

  for (let index = 0; index < totalCells; index += 1) {
    const dayNumber = index - startOffset + 1;
    let cellDate;
    let muted = false;

    if (dayNumber < 1) {
      cellDate = new Date(year, month - 1, daysInPrevMonth + dayNumber);
      muted = true;
    } else if (dayNumber > daysInMonth) {
      cellDate = new Date(year, month + 1, dayNumber - daysInMonth);
      muted = true;
    } else {
      cellDate = new Date(year, month, dayNumber);
    }

    const key = toDateKey(cellDate);
    const entry = state.entries[key] || {};
    const dayTasks = getTasksForDate(key);
    const modeEmoji = entry?.wellbeing ? moodRangeSteps[normalizeWellbeing(entry.wellbeing).moodIndex].emoji : "";

    const dayButton = document.createElement("button");
    dayButton.type = "button";
    dayButton.className = "calendar-day";
    dayButton.dataset.dateKey = key;
    if (muted) dayButton.classList.add("muted");
    if (key === todayKey) dayButton.classList.add("today");
    if (key === selectedDateKey) dayButton.classList.add("selected");
    if (dayTasks.length || modeEmoji) dayButton.classList.add("has-entry");

    const taskHtml = dayTasks.length
      ? dayTasks.slice(0, 3).map((task) => `<span class="calendar-task-pill${isTaskDoneOnDate(task, key) ? " done" : ""}">${escapeHtml(task.title)}</span>`).join("")
      : `<span class="calendar-empty"></span>`;

    dayButton.innerHTML = `
      <div class="day-number">${cellDate.getDate()}</div>
      <div class="calendar-stickers">${modeEmoji ? `<span>${modeEmoji}</span>` : ""}</div>
      <div class="calendar-task-stack">${taskHtml}</div>
    `;

    dayButton.addEventListener("click", () => {
      if (isMobileLike() && selectedTaskForMobile) {
        assignTaskToDate(selectedTaskForMobile, key);
        selectedTaskForMobile = null;
        renderTasks();
        syncMobileNav("calendar-panel");
        return;
      }
      selectedDateKey = key;
      renderCalendar();
      renderSelectedDay();
    });

    calendarGrid.appendChild(dayButton);
  }

  if (highlightedDateKey) {
    const highlightedCell = calendarGrid.querySelector(`[data-date-key="${highlightedDateKey}"]`);
    if (highlightedCell) highlightedCell.classList.add("drop-target");
  }
}

function renderSelectedDay() {
  const entry = getCurrentEntry();
  const date = fromDateKey(selectedDateKey);
  selectedDateLabel.textContent = date.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
  richEditor.innerHTML = entry.content || "";
  richEditor.dataset.placeholder = notePrompts[Math.floor(Math.random() * notePrompts.length)];
  renderWellbeing(entry.wellbeing);

  dayTaskList.innerHTML = "";
  const assignedTasks = getTasksForDate(selectedDateKey);
  if (!assignedTasks.length) {
    const emptyPill = document.createElement("div");
    emptyPill.className = "day-task-pill";
    emptyPill.textContent = "No tasks assigned to this day yet.";
    dayTaskList.appendChild(emptyPill);
    renderCalendarDayDetail();
    return;
  }

  assignedTasks.forEach((task) => {
    const pill = document.createElement("button");
    pill.className = "day-task-pill";
    pill.type = "button";
    pill.textContent = `${isTaskDoneOnDate(task, selectedDateKey) ? "✅" : "🪄"} ${task.title}`;
    pill.addEventListener("click", async () => {
      toggleTaskOnDate(task, selectedDateKey);
      await persist();
      renderCalendar();
      renderSelectedDay();
      renderTasks();
      renderTracker();
      celebrate(isTaskDoneOnDate(task, selectedDateKey) ? getCompletionMessage() : "Task reopened");
    });
    dayTaskList.appendChild(pill);
  });

  renderCalendarDayDetail();
}

function renderTasks() {
  const searchTerm = taskSearch.value.trim().toLowerCase();
  taskDrawer.innerHTML = "";

  const visibleTasks = state.tasks.filter((task) => {
    const assignedLabels = task.assignedDates.map((dateKey) => fromDateKey(dateKey).toLocaleDateString("en-US")).join(" ");
    const haystack = `${task.title} ${task.tag} ${task.detail} ${assignedLabels}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  visibleTasks.forEach((task) => {
    const card = taskTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.id = task.id;
    if (selectedTaskForMobile === task.id) card.classList.add("pick-mode");
    card.querySelector(".task-title").textContent = task.title;
    card.querySelector(".task-tag").innerHTML = renderTagBadge(task.tag);
    card.querySelector(".task-detail").textContent = task.detail || "No extra detail yet.";

    const checkbox = card.querySelector(".task-check");
    const selectedAssigned = task.assignedDates.includes(selectedDateKey);
    checkbox.checked = selectedAssigned && isTaskDoneOnDate(task, selectedDateKey);
    checkbox.disabled = !selectedAssigned;
    card.querySelector(".checkbox-pill span").textContent = selectedAssigned ? "Done Today" : "Not On Day";
    checkbox.addEventListener("change", async () => {
      if (!selectedAssigned) return;
      setTaskDoneOnDate(task, selectedDateKey, checkbox.checked);
      await persist();
      renderCalendar();
      renderSelectedDay();
      renderTasks();
      renderTracker();
      celebrate(checkbox.checked ? getCompletionMessage() : "Task reopened");
    });

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const assignButton = document.createElement("button");
    assignButton.className = "mini-button";
    assignButton.type = "button";
    assignButton.textContent = "Add To Selected Day";
    assignButton.addEventListener("click", () => assignTaskToDate(task.id, selectedDateKey));

    const removeButton = document.createElement("button");
    removeButton.className = "mini-button";
    removeButton.type = "button";
    removeButton.textContent = "Remove From Day";
    removeButton.addEventListener("click", async () => {
      task.assignedDates = task.assignedDates.filter((dateKey) => dateKey !== selectedDateKey);
      task.completedDates = task.completedDates.filter((dateKey) => dateKey !== selectedDateKey);
      await persist();
      renderCalendar();
      renderSelectedDay();
      renderTasks();
      renderTracker();
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "mini-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", async () => {
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      await persist();
      renderCalendar();
      renderSelectedDay();
      renderTasks();
      renderTracker();
      celebrate("Task removed");
    });

    actions.append(assignButton, removeButton, deleteButton);
    card.querySelector(".task-card-body").appendChild(actions);

    if (task.targetDate) {
      const targetPill = document.createElement("p");
      targetPill.className = "task-detail";
      targetPill.style.display = "block";
      targetPill.textContent = `Target date: ${formatTargetDate(task.targetDate)}`;
      card.querySelector(".task-card-body").appendChild(targetPill);
    }

    card.querySelector(".task-hook").addEventListener("click", () => {
      card.classList.toggle("expanded");
    });

    const startPickup = (clientX, clientY) => {
      draggedTaskId = task.id;
      card.classList.add("dragging");
      document.body.classList.add("drag-active");
      createDragGhost(task.title, clientX, clientY);
      celebrate("Picked up task", 500, false);
    };

    card.addEventListener("mousedown", (event) => {
      if (event.target.closest("button, input, label")) return;
      if (isMobileLike()) return;
      event.preventDefault();
      startPickup(event.clientX, event.clientY);
    });

    card.addEventListener("click", (event) => {
      if (event.target.closest("button, input, label")) return;
      if (!isMobileLike()) return;
      selectedTaskForMobile = selectedTaskForMobile === task.id ? null : task.id;
      renderTasks();
      celebrate(selectedTaskForMobile ? `Selected \"${task.title}\". Tap a date to assign it.` : "Selection cleared", 1200, false);
      syncMobileNav("calendar-panel");
    });

    taskDrawer.appendChild(card);
  });

  if (!visibleTasks.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "No matching tasks yet. Try another word or create a new task.";
    taskDrawer.appendChild(emptyState);
  }
}

function renderTracker() {
  trackerItems.innerHTML = "";
  const trackedTasks = state.tasks.filter((task) => task.targetDate);
  completionStat.textContent = `${trackedTasks.length}`;
  completionLabel.textContent = trackedTasks.length === 1 ? "tracked goal" : "tracked goals";

  if (!trackedTasks.length) {
    const empty = document.createElement("div");
    empty.className = "tracker-empty";
    empty.textContent = "Add a target completion date to a task if you want it to appear here as its own progress tracker.";
    trackerItems.appendChild(empty);
    return;
  }

  trackedTasks.forEach((task) => {
    const stats = getTaskTrackerStats(task);
    const card = document.createElement("article");
    card.className = "tracker-card";
    card.innerHTML = `
      <div class="tracker-card-top">
        <div>
          <h3>${escapeHtml(task.title)}</h3>
          <p class="tracker-date">Target: ${formatTargetDate(task.targetDate)}</p>
        </div>
        <span class="tracker-percent">${stats.percent}%</span>
      </div>
      <div class="progress-rail">
        <div class="progress-fill" style="width:${stats.percent}%"></div>
      </div>
      <p class="tracker-meta">${stats.completed} of ${stats.total} scheduled check-ins completed</p>
    `;
    trackerItems.appendChild(card);
  });
}

function addTask() {
  const titleInput = document.getElementById("task-title");
  const tagInput = document.getElementById("task-tag");
  const targetDateInput = document.getElementById("task-target-date");
  const detailInput = document.getElementById("task-detail");

  const title = titleInput.value.trim();
  const tag = tagInput.value;
  const targetDate = targetDateInput.value || null;
  const detail = detailInput.value.trim();

  if (!title || !tag) {
    celebrate("Add a title and choose a category first.", 1200, false);
    return;
  }

  state.tasks.unshift({
    id: crypto.randomUUID(),
    title,
    tag,
    targetDate,
    detail,
    assignedDates: [],
    completedDates: [],
  });

  titleInput.value = "";
  tagInput.value = "";
  targetDateInput.value = "";
  detailInput.value = "";

  persist().then(() => {
    renderTasks();
    renderTracker();
    celebrate("Task added");
  });
}

async function assignTaskToDate(taskId, dateKey) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (!task.assignedDates.includes(dateKey)) {
    task.assignedDates.push(dateKey);
    task.assignedDates.sort();
  }
  selectedDateKey = dateKey;
  await persist();
  clearDropTarget();
  renderCalendar();
  renderSelectedDay();
  renderTasks();
  renderTracker();
  celebrate("Task tucked into the calendar");
}

function setTaskDoneOnDate(task, dateKey, done) {
  if (done) {
    if (!task.completedDates.includes(dateKey)) task.completedDates.push(dateKey);
  } else {
    task.completedDates = task.completedDates.filter((item) => item !== dateKey);
  }
  task.completedDates.sort();
}

function toggleTaskOnDate(task, dateKey) {
  setTaskDoneOnDate(task, dateKey, !isTaskDoneOnDate(task, dateKey));
}

function isTaskDoneOnDate(task, dateKey) {
  return task.completedDates.includes(dateKey);
}

function getTaskTrackerStats(task) {
  const relevantDates = task.assignedDates.filter((dateKey) => !task.targetDate || dateKey <= task.targetDate).sort();
  const total = relevantDates.length;
  const completed = relevantDates.filter((dateKey) => isTaskDoneOnDate(task, dateKey)).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
}

function writeCurrentEditorToState() {
  const entry = getCurrentEntry();
  entry.content = richEditor.innerHTML.trim();
}

function getCurrentEntry() {
  if (!state.entries[selectedDateKey]) {
    state.entries[selectedDateKey] = { content: "", wellbeing: getEmptyWellbeing() };
  }
  state.entries[selectedDateKey].wellbeing = normalizeWellbeing(state.entries[selectedDateKey].wellbeing);
  return state.entries[selectedDateKey];
}

function syncDrawerButton() {
  toggleDrawerButton.textContent = taskDrawer.classList.contains("collapsed") ? "Open Drawer" : "Hide Drawer";
}

async function persist() {
  const cleanState = sanitizeState(state);
  state = cleanState;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanState));
  if (currentUser && cloudReady) await saveCloudState();
}

async function saveCloudState() {
  const { error } = await supabaseClient.from(CLOUD_TABLE).upsert({
    user_id: currentUser.id,
    app_state: sanitizeState(state),
    updated_at: new Date().toISOString(),
  });
  if (error) authMessage.textContent = `Cloud save failed: ${error.message}`;
}

function loadLocalCache() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (saved?.tasks && saved?.entries) return sanitizeState(saved);
  } catch (error) {
    console.warn(error);
  }
  return structuredClone(defaultData);
}

function sanitizeState(candidate) {
  const next = {
    profile: candidate?.profile && typeof candidate.profile === "object" ? { preferredName: candidate.profile.preferredName || "" } : { preferredName: "" },
    tasks: Array.isArray(candidate?.tasks)
      ? candidate.tasks.map((task) => ({
          id: task.id || crypto.randomUUID(),
          title: task.title || "",
          tag: task.tag || "Health",
          targetDate: task.targetDate || null,
          detail: task.detail || "",
          assignedDates: Array.isArray(task.assignedDates) ? task.assignedDates : [],
          completedDates: Array.isArray(task.completedDates) ? task.completedDates : [],
        }))
      : structuredClone(defaultData.tasks),
    entries: {},
  };

  if (candidate?.entries && typeof candidate.entries === "object") {
    Object.entries(candidate.entries).forEach(([dateKey, entry]) => {
      next.entries[dateKey] = {
        content: entry?.content || "",
        wellbeing: normalizeWellbeing(entry?.wellbeing),
      };
    });
  }

  return next;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderTagBadge(tag) {
  const meta = tagMeta[tag] || { icon: "🪄", className: "tag-rest" };
  return `<span class="tag-badge ${meta.className}">${meta.icon} ${escapeHtml(tag || "General")}</span>`;
}

function celebrate(message, duration = 1200, playSound = true) {
  feedbackBubble.textContent = message;
  feedbackBubble.classList.add("visible");
  clearTimeout(celebrate.timeoutId);
  celebrate.timeoutId = window.setTimeout(() => feedbackBubble.classList.remove("visible"), duration);
  if (playSound) playChime();
}

function playChime() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  gain.connect(context.destination);
  [659.25, 830.61].forEach((frequency, index) => {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, now);
    osc.connect(gain);
    osc.start(now + index * 0.03);
    osc.stop(now + 0.22 + index * 0.03);
  });
  window.setTimeout(() => context.close().catch(() => {}), 400);
}

function createDragGhost(title, clientX, clientY) {
  removeDragGhost();
  dragGhost = document.createElement("div");
  dragGhost.className = "drag-ghost";
  dragGhost.textContent = `✦ Drag \"${title}\" to a date`;
  document.body.appendChild(dragGhost);
  positionDragGhost(clientX, clientY);
}
function positionDragGhost(clientX, clientY) {
  if (!dragGhost) return;
  dragGhost.style.left = `${clientX}px`;
  dragGhost.style.top = `${clientY - 14}px`;
}
function updatePointerDrag(clientX, clientY) {
  if (!draggedTaskId) return;
  positionDragGhost(clientX, clientY);
  const element = document.elementFromPoint(clientX, clientY);
  const dateCell = element?.closest?.(".calendar-day");
  const nextDateKey = dateCell?.dataset?.dateKey || null;
  if (nextDateKey === highlightedDateKey) return;
  highlightedDateKey = nextDateKey;
  renderCalendar();
}
function finishPointerDrag() {
  if (!draggedTaskId) return;
  const taskId = draggedTaskId;
  const dropDateKey = highlightedDateKey;
  const draggingCard = taskDrawer.querySelector(`[data-id="${taskId}"]`);
  if (draggingCard) draggingCard.classList.remove("dragging");
  draggedTaskId = null;
  document.body.classList.remove("drag-active");
  window.getSelection?.()?.removeAllRanges?.();
  removeDragGhost();
  if (dropDateKey) {
    assignTaskToDate(taskId, dropDateKey);
    return;
  }
  clearDropTarget();
}
function clearDropTarget() {
  highlightedDateKey = null;
  document.body.classList.remove("drag-active");
  renderCalendar();
}
function removeDragGhost() {
  if (!dragGhost) return;
  dragGhost.remove();
  dragGhost = null;
}

function getEmptyWellbeing() {
  return { moodIndex: null, hydration: null };
}
function normalizeWellbeing(candidate) {
  return {
    moodIndex: Number.isFinite(candidate?.moodIndex) ? Math.max(0, Math.min(3, Number(candidate.moodIndex))) : null,
    hydration: normalizePercent(candidate?.hydration, null),
  };
}
function normalizePercent(value, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}
function renderWellbeing(wellbeing = getEmptyWellbeing()) {
  const normalized = normalizeWellbeing(wellbeing);
  const moodStep = Number.isInteger(normalized.moodIndex) ? moodRangeSteps[normalized.moodIndex] : null;
  moodRange.value = String(Number.isInteger(normalized.moodIndex) ? normalized.moodIndex : 1);
  moodRangeEmoji.textContent = moodStep ? moodStep.emoji : "○";
  moodRangeValue.textContent = moodStep ? moodStep.label : "Not set";
  hydrationRange.value = String(Number.isFinite(normalized.hydration) ? normalized.hydration : 50);
  hydrationRangeValue.textContent = Number.isFinite(normalized.hydration) ? `💧 ${normalized.hydration}%` : "💧 Not set";
}
function handleWellbeingInput() {
  const entry = getCurrentEntry();
  entry.wellbeing = normalizeWellbeing({ moodIndex: Number(moodRange.value), hydration: Number(hydrationRange.value) });
  renderWellbeing(entry.wellbeing);
  renderCalendar();
  renderCalendarDayDetail();
  queueSave();
}

function getPreferredName() {
  return state?.profile?.preferredName || currentUser?.user_metadata?.preferred_name || "";
}
function updateGreeting() {
  const preferredName = getPreferredName();
  heroGreeting.textContent = preferredName ? `Hello, ${preferredName}.` : "Hello there.";
}
function getCompletionMessage() {
  return completionMessages[Math.floor(Math.random() * completionMessages.length)];
}
function normalizeTasks() {
  state.profile = { preferredName: state?.profile?.preferredName || "" };
  state.tasks.forEach((task) => {
    task.targetDate = task.targetDate || null;
    task.assignedDates = Array.isArray(task.assignedDates) ? task.assignedDates : [];
    task.completedDates = Array.isArray(task.completedDates) ? task.completedDates : [];
  });
}
function formatTargetDate(dateKey) {
  return fromDateKey(dateKey).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function renderCalendarDayDetail() {
  if (!calendarDayDetail) return;
  const entry = getCurrentEntry();
  const date = fromDateKey(selectedDateKey);
  const tasks = getTasksForDate(selectedDateKey);
  const spark = stripHtml(entry.content || "") || "Nothing added yet. Tap a task or note to begin.";
  const wellbeing = normalizeWellbeing(entry.wellbeing);
  const modeCopy = Number.isInteger(wellbeing.moodIndex) ? moodRangeSteps[wellbeing.moodIndex].emoji : "Not set";
  const hydrationCopy = Number.isFinite(wellbeing.hydration) ? `💧 ${wellbeing.hydration}%` : "💧 Not set";

  calendarDayDetail.innerHTML = `
    <h3>${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</h3>
    <div class="calendar-day-detail-tasks">
      ${
        tasks.length
          ? tasks
              .map((task) => `
                <article class="calendar-day-detail-task">
                  <strong>${isTaskDoneOnDate(task, selectedDateKey) ? "✅" : "🪄"} ${escapeHtml(task.title)}</strong>
                  <p>${escapeHtml(task.detail || "A soft little step for this day.")}</p>
                </article>
              `)
              .join("")
          : '<article class="calendar-day-detail-task"><strong>No tasks set for this day yet.</strong><p>Pick something from the drawer and drop it onto this date.</p></article>'
      }
    </div>
    <p class="calendar-day-detail-copy"><strong>Little spark:</strong> ${escapeHtml(spark)}</p>
    <p class="calendar-day-detail-copy"><strong>Today’s mode:</strong> ${modeCopy}</p>
    <p class="calendar-day-detail-copy"><strong>Hydration:</strong> ${hydrationCopy}</p>
  `;
}
function stripHtml(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return (temp.textContent || "").trim();
}
function isMobileLike() {
  return window.matchMedia("(max-width: 720px)").matches || "ontouchstart" in window;
}
function syncMobileNav(panelName) {
  mobileNavButtons.forEach((button) => button.classList.toggle("active", button.dataset.panelTarget === panelName));
}
function syncMobileNavToScroll() {
  if (!isMobileLike()) return;
  const containerRect = mobileSections.getBoundingClientRect();
  let closestPanel = null;
  let smallestDistance = Number.POSITIVE_INFINITY;
  mobileSections.querySelectorAll(".mobile-panel").forEach((panel) => {
    const distance = Math.abs(panel.getBoundingClientRect().left - containerRect.left);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      closestPanel = panel.dataset.panelName;
    }
  });
  if (closestPanel) syncMobileNav(closestPanel);
}
function ensureMobileCalendarLanding() {
  if (!isMobileLike()) return;
  const target = mobileSections?.querySelector?.('[data-panel-name="calendar-panel"]');
  if (!target) return;
  window.requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "auto", inline: "start", block: "nearest" });
    syncMobileNav("calendar-panel");
  });
}
function debounce(callback, wait) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}
function queueSave() {
  clearTimeout(saveTimeoutId);
  saveTimeoutId = window.setTimeout(async () => {
    writeCurrentEditorToState();
    await persist();
    renderCalendar();
    renderCalendarDayDetail();
  }, 250);
}
function getTasksForDate(dateKey) {
  return state.tasks.filter((task) => task.assignedDates.includes(dateKey));
}
