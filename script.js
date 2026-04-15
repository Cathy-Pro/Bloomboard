const STORAGE_KEY = "mindful-journal-garden-v2";
const CLOUD_TABLE = "user_journal_state";

const inspirations = [
  { text: '"And now that you don\'t have to be perfect, you can be good."', source: "John Steinbeck, East of Eden" },
  { text: '"I am rooted, but I flow."', source: "Virginia Woolf, The Waves" },
  { text: '"There was another life that I might have had, but I am having this one."', source: "Kazuo Ishiguro, Never Let Me Go" },
  { text: '"I took a deep breath and listened to the old brag of my heart: I am, I am, I am."', source: "Sylvia Plath, The Bell Jar" },
];

const moods = [
  { id: "calm", icon: "🌿", label: "Calm" },
  { id: "hopeful", icon: "🌞", label: "Hopeful" },
  { id: "soft", icon: "☁️", label: "Soft" },
  { id: "energized", icon: "✨", label: "Energized" },
  { id: "reflective", icon: "📖", label: "Reflective" },
];

const stickers = ["🌷", "🌈", "🫖", "🍓", "🕊️", "⭐", "🍀", "🪴", "💌", "🎧"];
const tagMeta = {
  Health: { icon: "🫀", className: "tag-health" },
  Wellbeing: { icon: "🌼", className: "tag-wellbeing" },
  Mindfulness: { icon: "🧘", className: "tag-mindfulness" },
  Focus: { icon: "🎯", className: "tag-focus" },
  Creativity: { icon: "🎨", className: "tag-creativity" },
  Rest: { icon: "☁️", className: "tag-rest" },
};

const defaultData = {
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
let activeMood = null;
let draggedTaskId = null;
let dragGhost = null;
let highlightedDateKey = null;
let currentUser = null;
let supabaseClient = null;
let cloudReady = false;
let hasRenderedApp = false;
let saveTimeoutId = null;

const authShell = document.getElementById("auth-shell");
const authEmailInput = document.getElementById("auth-email");
const authPasswordInput = document.getElementById("auth-password");
const authMessage = document.getElementById("auth-message");
const signInButton = document.getElementById("sign-in-button");
const signUpButton = document.getElementById("sign-up-button");
const signOutButton = document.getElementById("sign-out-button");
const accountEmail = document.getElementById("account-email");

const monthLabel = document.getElementById("month-label");
const calendarGrid = document.getElementById("calendar-grid");
const selectedDateLabel = document.getElementById("selected-date-label");
const heroMessage = document.getElementById("hero-message");
const moodStrip = document.getElementById("mood-strip");
const entryTitleInput = document.getElementById("entry-title");
const richEditor = document.getElementById("rich-editor");
const stickerPicker = document.getElementById("sticker-picker");
const selectedStickers = document.getElementById("selected-stickers");
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

const config = window.APP_CONFIG || {};

boot();

async function boot() {
  initializeClient();
  wireGlobalEvents();
  renderInspiration();
  renderMoodStrip();
  renderStickerPicker();
  renderApp();

  if (!cloudReady) {
    authMessage.textContent = "";
    accountEmail.textContent = "Setup needed";
    authShell.classList.add("visible");
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    authMessage.textContent = error.message;
  }
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
    entry.mood = null;
    entry.stickers = [];
    activeMood = null;
    await persist();
    renderCalendar();
    renderSelectedDay();
  });

  document.getElementById("clear-stickers").addEventListener("click", async () => {
    getCurrentEntry().stickers = [];
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

  entryTitleInput.addEventListener("input", queueSave);
  richEditor.addEventListener("input", queueSave);

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

  document.addEventListener("touchend", () => {
    finishPointerDrag();
  });
}

async function handleAuth(mode) {
  if (!cloudReady) {
    authMessage.textContent = "Account login isn't connected yet. Add your Supabase keys in app-config.js first.";
    return;
  }
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value.trim();
  if (!email || !password) {
    authMessage.textContent = "Enter both email and password.";
    return;
  }

  authMessage.textContent = mode === "sign-up" ? "Creating account..." : "Signing in...";
  const fn = mode === "sign-up" ? supabaseClient.auth.signUp.bind(supabaseClient.auth) : supabaseClient.auth.signInWithPassword.bind(supabaseClient.auth);

  try {
    const { error } = await fn({ email, password });
    authMessage.textContent = error
      ? error.message
      : mode === "sign-up"
        ? "Account created. Check your email if confirmation is enabled, then sign in."
        : "Signed in.";
  } catch (error) {
    authMessage.textContent = "Unable to reach Supabase. Check your project URL/key, internet connection, and try serving the site from a local web server instead of opening the HTML file directly.";
    console.error("Auth request failed", error);
  }
}

async function handleSignOut() {
  if (!cloudReady) return;
  await supabaseClient.auth.signOut();
}

function applyAuthState() {
  if (currentUser) {
    authShell.classList.remove("visible");
    accountEmail.textContent = currentUser.email || "Signed in";
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

  const { data, error } = await supabaseClient
    .from(CLOUD_TABLE)
    .select("app_state")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    authMessage.textContent = `Cloud load failed: ${error.message}`;
    state = loadLocalCache();
  } else if (data?.app_state) {
    state = sanitizeState(data.app_state);
  } else {
    state = loadLocalCache();
    await saveCloudState();
  }

  normalizeTasks();
  renderApp();
}

function renderApp() {
  if (!hasRenderedApp) {
    hasRenderedApp = true;
  }
  renderInspiration();
  renderMoodStrip();
  renderStickerPicker();
  renderCalendar();
  renderSelectedDay();
  renderTasks();
  renderTracker();
  syncDrawerButton();
}

function renderInspiration() {
  const item = inspirations[inspirationIndex % inspirations.length];
  heroMessage.textContent = `${item.text}  •  ${item.source}`;
}

function renderMoodStrip() {
  moodStrip.innerHTML = "";
  moods.forEach((mood) => {
    const button = document.createElement("button");
    button.className = `mood-chip${activeMood === mood.id ? " active" : ""}`;
    button.type = "button";
    button.textContent = `${mood.icon} ${mood.label}`;
    button.addEventListener("click", async () => {
      activeMood = mood.id;
      getCurrentEntry().mood = activeMood;
      await persist();
      renderMoodStrip();
      celebrate("Mood updated", 540, false);
    });
    moodStrip.appendChild(button);
  });
}

function renderStickerPicker() {
  stickerPicker.innerHTML = "";
  stickers.forEach((sticker) => {
    const button = document.createElement("button");
    button.className = "sticker-chip";
    button.type = "button";
    button.textContent = sticker;
    button.addEventListener("click", async () => {
      const entry = getCurrentEntry();
      entry.stickers = entry.stickers || [];
      entry.stickers.push(sticker);
      await persist();
      renderCalendar();
      renderSelectedDay();
      celebrate("Sticker added", 540, false);
    });
    stickerPicker.appendChild(button);
  });
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
    const dayButton = document.createElement("button");
    dayButton.type = "button";
    dayButton.className = "calendar-day";
    dayButton.dataset.dateKey = key;
    if (muted) dayButton.classList.add("muted");
    if (key === todayKey) dayButton.classList.add("today");
    if (key === selectedDateKey) dayButton.classList.add("selected");
    if (dayTasks.length || (entry.stickers || []).length) dayButton.classList.add("has-entry");

    const stickerHtml = (entry.stickers || []).slice(0, 3).map((sticker) => `<span>${sticker}</span>`).join("");
    const taskHtml = dayTasks.length
      ? dayTasks.slice(0, 3).map((task) => `<span class="calendar-task-pill${isTaskDoneOnDate(task, key) ? " done" : ""}">${escapeHtml(task.title)}</span>`).join("")
      : `<span class="calendar-empty"></span>`;

    dayButton.innerHTML = `
      <div class="day-number">${cellDate.getDate()}</div>
      <div class="calendar-stickers">${stickerHtml}</div>
      <div class="calendar-task-stack">${taskHtml}</div>
    `;

    dayButton.addEventListener("click", () => {
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
  selectedDateLabel.textContent = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  entryTitleInput.value = entry.title || "";
  richEditor.innerHTML = entry.content || "";
  activeMood = entry.mood || null;
  renderMoodStrip();

  selectedStickers.innerHTML = "";
  (entry.stickers || []).forEach((sticker, index) => {
    const chip = document.createElement("button");
    chip.className = "selected-sticker";
    chip.type = "button";
    chip.textContent = `${sticker} remove`;
    chip.addEventListener("click", async () => {
      entry.stickers.splice(index, 1);
      await persist();
      renderCalendar();
      renderSelectedDay();
    });
    selectedStickers.appendChild(chip);
  });

  dayTaskList.innerHTML = "";
  const assignedTasks = getTasksForDate(selectedDateKey);
  if (!assignedTasks.length) {
    const emptyPill = document.createElement("div");
    emptyPill.className = "day-task-pill";
    emptyPill.textContent = "No tasks assigned to this day yet.";
    dayTaskList.appendChild(emptyPill);
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
      celebrate(isTaskDoneOnDate(task, selectedDateKey) ? "Task completed" : "Task reopened");
    });
    dayTaskList.appendChild(pill);
  });
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
      celebrate(checkbox.checked ? "Task completed" : "Task reopened");
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
      createDragGhost(task.title, clientX, clientY);
      celebrate("Picked up task", 500, false);
    };

    card.addEventListener("mousedown", (event) => {
      if (event.target.closest("button, input, label")) return;
      startPickup(event.clientX, event.clientY);
    });

    card.addEventListener("touchstart", (event) => {
      if (event.target.closest("button, input, label")) return;
      const touch = event.touches[0];
      if (!touch) return;
      startPickup(touch.clientX, touch.clientY);
    }, { passive: true });

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

async function addTask() {
  const titleInput = document.getElementById("task-title");
  const tagInput = document.getElementById("task-tag");
  const targetDateInput = document.getElementById("task-target-date");
  const detailInput = document.getElementById("task-detail");
  const title = titleInput.value.trim();
  if (!title) return;

  state.tasks.unshift({
    id: crypto.randomUUID(),
    title,
    tag: tagInput.value,
    targetDate: targetDateInput.value || null,
    detail: detailInput.value.trim(),
    assignedDates: [],
    completedDates: [],
  });

  titleInput.value = "";
  tagInput.value = "Health";
  targetDateInput.value = "";
  detailInput.value = "";
  await persist();
  renderTasks();
  renderTracker();
  celebrate("Task added");
}

function queueSave() {
  window.clearTimeout(saveTimeoutId);
  saveTimeoutId = window.setTimeout(async () => {
    writeCurrentEditorToState();
    await persist();
    renderCalendar();
  }, 180);
}

function assignDraggedTaskToDate(dateKey) {
  if (!draggedTaskId) return;
  assignTaskToDate(draggedTaskId, dateKey);
}

async function assignTaskToDate(taskId, dateKey) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (!task.assignedDates.includes(dateKey)) {
    task.assignedDates.push(dateKey);
  }
  selectedDateKey = dateKey;
  draggedTaskId = null;
  clearDropTarget();
  removeDragGhost();
  await persist();
  renderCalendar();
  renderSelectedDay();
  renderTasks();
  renderTracker();
  celebrate("Task tucked into the calendar");
}

function getTasksForDate(dateKey) {
  return state.tasks.filter((task) => task.assignedDates.includes(dateKey));
}

function setTaskDoneOnDate(task, dateKey, done) {
  if (done) {
    if (!task.completedDates.includes(dateKey)) task.completedDates.push(dateKey);
    return;
  }
  task.completedDates = task.completedDates.filter((item) => item !== dateKey);
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
  entry.title = entryTitleInput.value.trim();
  entry.content = richEditor.innerHTML.trim();
  entry.mood = activeMood;
}

function getCurrentEntry() {
  if (!state.entries[selectedDateKey]) {
    state.entries[selectedDateKey] = { title: "", content: "", mood: null, stickers: [] };
  }
  return state.entries[selectedDateKey];
}

function syncDrawerButton() {
  toggleDrawerButton.textContent = taskDrawer.classList.contains("collapsed") ? "Open Drawer" : "Hide Drawer";
}

async function persist() {
  const cleanState = sanitizeState(state);
  state = cleanState;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanState));
  if (currentUser && cloudReady) {
    await saveCloudState();
  }
}

async function saveCloudState() {
  const { error } = await supabaseClient.from(CLOUD_TABLE).upsert({
    user_id: currentUser.id,
    app_state: sanitizeState(state),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    authMessage.textContent = `Cloud save failed: ${error.message}`;
  }
}

function loadLocalCache() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (saved?.tasks && saved?.entries) return sanitizeState(saved);
  } catch (error) {
    console.warn("Unable to load saved journal state", error);
  }
  return structuredClone(defaultData);
}

function sanitizeState(candidate) {
  const next = {
    tasks: Array.isArray(candidate?.tasks) ? candidate.tasks.map((task) => ({
      id: task.id || crypto.randomUUID(),
      title: task.title || "",
      tag: task.tag || "Health",
      targetDate: task.targetDate || null,
      detail: task.detail || "",
      assignedDates: Array.isArray(task.assignedDates) ? task.assignedDates : [],
      completedDates: Array.isArray(task.completedDates) ? task.completedDates : [],
    })) : structuredClone(defaultData.tasks),
    entries: candidate?.entries && typeof candidate.entries === "object" ? candidate.entries : {},
  };
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
  window.clearTimeout(celebrate.timeoutId);
  celebrate.timeoutId = window.setTimeout(() => {
    feedbackBubble.classList.remove("visible");
  }, duration);
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
  dragGhost.textContent = `✦ Drag "${title}" to a date`;
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
  removeDragGhost();
  if (dropDateKey) {
    assignTaskToDate(taskId, dropDateKey);
    return;
  }
  clearDropTarget();
}

function clearDropTarget() {
  highlightedDateKey = null;
  renderCalendar();
}

function removeDragGhost() {
  if (!dragGhost) return;
  dragGhost.remove();
  dragGhost = null;
}

function normalizeTasks() {
  state.tasks.forEach((task) => {
    task.targetDate = task.targetDate || null;
    task.assignedDates = Array.isArray(task.assignedDates) ? task.assignedDates : [];
    task.completedDates = Array.isArray(task.completedDates) ? task.completedDates : [];
    if (typeof task.completed === "boolean") {
      task.completedDates = task.completed ? [...task.assignedDates] : [];
      delete task.completed;
    }
    if ("kind" in task) delete task.kind;
  });
}

function formatTargetDate(dateKey) {
  return fromDateKey(dateKey).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
