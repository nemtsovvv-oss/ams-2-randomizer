
const SUPABASE_URL = "https://edjwnpbjmpacftxbglbx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_7C7FbFcevgoVAL3dNxdXoQ_baIQe8Bz";

const configured =
  !SUPABASE_URL.startsWith("YOUR_") &&
  !SUPABASE_ANON_KEY.startsWith("YOUR_");

const sb = configured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const $ = id => document.getElementById(id);

let currentEvent = null;
let categories = [];
let currentUser = null;
let isAdmin = false;
let isOpen = true;

let gt3Races = [];
let gt3Laps = [];
let gt3Events = [];

const categoryOrder = ["track", "car_class", "weather"];

const labels = {
  track: "Трасса",
  car_class: "Класс автомобиля",
  weather: "Погода"
};

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function optionLabel(id) {
  const option = categories.find(o => o.id === id);
  return option ? option.label : String(id);
}

function resultValues(value) {
  if (Array.isArray(value)) return value;
  if (value) return [value, value];
  return [];
}

function normalizedVotes(selections, category) {
  const value = selections?.[category];

  if (Array.isArray(value)) {
    if (value.length === 1) return [value[0], value[0]];
    return value.slice(0, 2);
  }

  if (value) return [value, value];
  return [];
}

function formatVoteTime(value) {
  if (!value) return "Время неизвестно";

  return new Date(value).toLocaleString("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatLapTime(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) {
    return "—";
  }

  const value = Math.round(Number(ms));
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const milliseconds = value % 1000;

  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function parseLapTime(value) {
  const match = String(value).trim().match(/^(\d+):([0-5]?\d)(?:[.,](\d{1,3}))?$/);
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = Number((match[3] || "").padEnd(3, "0"));
  const result = minutes * 60000 + seconds * 1000 + fraction;

  return result > 0 ? result : null;
}

function isGT3Class(id) {
  return optionLabel(id).toUpperCase().includes("GT3");
}

function getRaceLaps(raceId) {
  return gt3Laps
    .filter(lap => lap.race_result_id === raceId)
    .sort((a, b) => a.lap_ms - b.lap_ms);
}

function getBestRecord(trackName) {
  const key = String(trackName || "").trim().toLowerCase();

  const raceIds = gt3Races
    .filter(race =>
      String(race.track_name || "").trim().toLowerCase() === key
    )
    .map(race => race.id);

  return gt3Laps
    .filter(lap => raceIds.includes(lap.race_result_id))
    .sort((a, b) => a.lap_ms - b.lap_ms)[0] || null;
}

function getRaceTitle(race) {
  const event = gt3Events.find(item => item.id === race.event_id);
  return event?.title || "Гоночный вечер";
}

function getRaceDate(race) {
  const event = gt3Events.find(item => item.id === race.event_id);
  const value = event?.created_at || race.created_at;

  if (!value) return "";

  return new Date(value).toLocaleDateString("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function installExtraStyles() {
  if ($("extra-styles")) return;

  const style = document.createElement("style");
  style.id = "extra-styles";
  style.textContent = `
    .voter-list{display:grid;gap:10px;margin-top:14px}
    .voter-card{padding:13px;border:1px solid var(--line);border-radius:12px;background:#0d1720}
    .voter-name{font-weight:800;margin-bottom:5px}
    .voter-time{font-size:11px;color:var(--accent);margin-bottom:9px}
    .voter-picks{display:grid;gap:5px;font-size:13px;color:var(--muted)}
    .voter-picks strong{color:var(--text)}
    .admin-option{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:11px;margin-top:8px}
    .admin-option input{width:auto;flex:0 0 auto;margin:0;accent-color:var(--accent)}
    .admin-option span{flex:1;min-width:0}
    .admin-option small{display:block;color:var(--muted);font-size:10px}
    .admin-option.disabled-option{opacity:.55}
    .voter-actions{margin-top:10px;display:flex;justify-content:flex-end}
    .voter-actions button,.admin-option button{font-size:12px}
    .admin-option button{flex:0 0 auto}
    .gt3-race-card{border-top:1px solid var(--line);padding-top:15px;margin-top:15px}
    .gt3-race-card:first-child{border-top:0;padding-top:0;margin-top:10px}
    .gt3-lap-list{display:grid;gap:8px;margin-top:12px}
    .gt3-lap-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;background:#0d1720;border:1px solid var(--line);border-radius:10px;padding:11px}
    .gt3-lap-main{min-width:0}
    .gt3-lap-driver{font-weight:800;overflow-wrap:anywhere}
    .gt3-lap-meta{color:var(--muted);font-size:11px;margin-top:3px}
    .gt3-lap-time{font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}
    .gt3-lap-edit{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
    .gt3-lap-edit input{min-width:0}
    .gt3-lap-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px}
    .gt3-lap-actions .btn{padding:7px 10px;font-size:12px}
    .gt3-history-card{border:1px solid var(--line);border-radius:12px;background:#0d1720;padding:13px;margin-top:10px}
    .gt3-history-heading{font-weight:800;margin-bottom:4px}
    .gt3-history-sub{color:var(--muted);font-size:11px;margin-bottom:10px}
    .gt3-admin-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .gt3-admin-fields .field{min-width:0}
    .gt3-history-lap{border-top:1px solid var(--line);padding-top:10px;margin-top:10px}
    .record-history{display:grid;gap:12px;margin-top:12px}
    .gt3-admin-add{border-top:1px solid var(--line);margin-top:12px;padding-top:12px}
    .gt3-admin-add h4{font-size:13px;margin:0 0 8px}
    .admin-page-note{margin-bottom:12px}
    @media(max-width:600px){
      .gt3-lap-edit,.gt3-admin-fields{grid-template-columns:1fr}
      .gt3-lap-item{grid-template-columns:1fr}
      .gt3-lap-time{font-size:18px}
    }
  `;

  document.head.appendChild(style);
}

function applyEventView() {
  const publicResultsOnly = Boolean(currentEvent?.result) && !isAdmin;

  document.querySelectorAll(".tab").forEach(button => {
    const name = button.dataset.tab;

    button.classList.toggle(
      "hidden",
      (publicResultsOnly && ["vote", "admin"].includes(name)) ||
      (name === "gt3-admin" && !isAdmin)
    );
  });

  if (publicResultsOnly) {
    $("vote").classList.add("hidden");
    $("admin").classList.add("hidden");
    $("gt3-admin").classList.add("hidden");

    const active = document.querySelector(".tab.active");
    if (!active || ["vote", "admin", "gt3-admin"].includes(active.dataset.tab)) {
      tab("result");
    }
  }

  if (!isAdmin) {
    $("gt3-admin").classList.add("hidden");
  }
}

function tab(name) {
  if (
    currentEvent?.result &&
    !isAdmin &&
    ["vote", "admin", "gt3-admin"].includes(name)
  ) {
    name = "result";
  }

  if (name === "gt3-admin" && !isAdmin) {
    name = "records";
  }

  document.querySelectorAll(".tab").forEach(button =>
    button.classList.toggle("active", button.dataset.tab === name)
  );

  ["vote", "result", "records", "admin", "gt3-admin"].forEach(id => {
    const section = $(id);
    if (section) section.classList.toggle("hidden", id !== name);
  });

  if (name === "result" && currentEvent) {
    loadResult();
    loadVoteStats();
  }

  if (name === "records") {
    loadGT3Records();
  }

  if (name === "admin" && currentUser) {
    loadAdmin();
  }

  if (name === "gt3-admin" && isAdmin) {
    loadGT3Records();
  }

  applyEventView();
}

document.querySelectorAll(".tab").forEach(button => {
  button.onclick = () => tab(button.dataset.tab);
});

function msg(id, text) {
  if ($(id)) $(id).textContent = text;
}

function showError(context, error) {
  console.error(context, error);
  $("connection").textContent = context + ": " + error.message;
}

async function init() {
  if (!configured || !sb) {
    $("connection").textContent = "Нужно подключить Supabase";
    return;
  }

  installExtraStyles();
  $("connection").textContent = "Подключаемся…";

  const { data: ev, error } = await sb
    .from("events")
    .select("*")
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    showError("Ошибка загрузки события", error);
    return;
  }

  currentEvent = ev;
  isAdmin = false;

  if (!ev) {
    $("connection").textContent = "Создай гоночный вечер в SQL / админке";
    await loadGT3Records();

    if (currentUser) await loadAdmin();
    applyEventView();
    return;
  }

  isOpen = ev.voting_open;

  $("event-title").textContent = ev.title;
  $("event-state").textContent = isOpen
    ? "Голосование открыто"
    : "Голосование закрыто";

  $("connection").textContent = "Подключено";
  $("submit-vote").disabled = !isOpen;

  await loadOptions();
  await loadVotesCount();
  await loadGT3Records();
  await loadResult();
  await loadVoteStats();

  if (currentUser) await loadAdmin();

  if (!currentEvent.result && !isAdmin) tab("vote");
  applyEventView();
}

async function loadOptions() {
  const { data, error } = await sb
    .from("options")
    .select("id,category,label,active,sort_order")
    .order("sort_order");

  if (error) {
    showError("Ошибка загрузки вариантов", error);
    return;
  }

  categories = data || [];

  $("vote-categories").innerHTML = categoryOrder.map(cat => `
    <div class="panel">
      <h2>${labels[cat]}</h2>
      <div class="hint">
        Выбери до двух вариантов. Если выберешь один вариант
        в категории — голос удвоится.
      </div>
      <div class="options">
        ${categories
          .filter(option => option.category === cat && option.active)
          .map(option => `
            <label class="option">
              <input type="checkbox" name="${cat}" value="${option.id}">
              <span>${escapeHtml(option.label)}</span>
            </label>
          `).join("") ||
          '<div class="muted">Пока нет активных вариантов</div>'}
      </div>
    </div>
  `).join("");

  categoryOrder.forEach(cat => {
    document.querySelectorAll(`input[name="${cat}"]`).forEach(input => {
      input.addEventListener("change", () => {
        const checked = document.querySelectorAll(`input[name="${cat}"]:checked`);

        if (checked.length > 2) {
          input.checked = false;
          alert("Можно выбрать не больше двух вариантов.");
        }
      });
    });
  });
}

async function loadVotesCount() {
  if (!currentEvent) return;

  const { count, error } = await sb
    .from("votes")
    .select("*", { count: "exact", head: true })
    .eq("event_id", currentEvent.id);

  if (error) {
    console.error(error);
    return;
  }

  $("vote-count").textContent = (count || 0) + " голосов";
}

$("submit-vote").onclick = async () => {
  if (!currentEvent || !isOpen) return;

  const button = $("submit-vote");
  const nickname = $("nickname").value.trim();

  if (!nickname) {
    alert("Введи ник");
    return;
  }

  const selections = {};

  for (const cat of categoryOrder) {
    const checked = [
      ...document.querySelectorAll(`input[name="${cat}"]:checked`)
    ].map(element => element.value);

    selections[cat] = checked.length === 1
      ? [checked[0], checked[0]]
      : checked;
  }

  if (!categoryOrder.some(cat => selections[cat].length > 0)) {
    alert("Выбери хотя бы один вариант.");
    return;
  }

  button.disabled = true;

  const { data: existing, error: checkError } = await sb
    .from("votes")
    .select("nickname")
    .eq("event_id", currentEvent.id)
    .ilike("nickname", nickname)
    .limit(1);

  if (checkError) {
    button.disabled = !isOpen;
    alert("Не удалось проверить голос: " + checkError.message);
    return;
  }

  if (existing?.length) {
    button.disabled = !isOpen;
    alert("Вы уже проголосовали. Повторно голосовать нельзя.");
    return;
  }

  const { error } = await sb.from("votes").insert({
    event_id: currentEvent.id,
    nickname,
    selections
  });

  if (error) {
    button.disabled = !isOpen;

    if (error.code === "23505") {
      alert("Вы уже проголосовали. Повторно голосовать нельзя.");
    } else {
      alert("Не удалось сохранить голос: " + error.message);
    }

    return;
  }

  document.querySelectorAll("#vote-categories input")
    .forEach(input => input.disabled = true);

  $("nickname").disabled = true;
  button.textContent = "Голос принят";

  await loadVotesCount();
  await loadVoteStats();

  alert("Голос сохранён.");
};

$("refresh").onclick = init;

$("login").onclick = async () => {
  if (!sb) {
    msg("login-message", "Сначала настрой Supabase");
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({
    email: $("admin-email").value,
    password: $("admin-password").value
  });

  if (error) {
    msg("login-message", error.message);
    return;
  }

  currentUser = data.user;
  await loadAdmin();

  if (isAdmin) tab("admin");
};

$("logout").onclick = async () => {
  await sb.auth.signOut();

  currentUser = null;
  isAdmin = false;

  $("admin-panel").classList.add("hidden");
  $("login-panel").classList.remove("hidden");

  tab("records");
  applyEventView();
};

async function loadAdmin() {
  if (!currentUser) return;

  installExtraStyles();

  const { data: profile, error } = await sb
    .from("admin_users")
    .select("user_id")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    msg("login-message", error.message);
    return;
  }

  if (!profile) {
    isAdmin = false;
    msg("login-message", "У этого аккаунта нет прав администратора.");

    await sb.auth.signOut();
    currentUser = null;

    $("admin-panel").classList.add("hidden");
    $("login-panel").classList.remove("hidden");

    applyEventView();
    return;
  }

  isAdmin = true;

  $("login-panel").classList.add("hidden");
  $("admin-panel").classList.remove("hidden");

  if (currentEvent) {
    $("event-name").value = currentEvent.title;
    $("toggle-event").textContent = isOpen
      ? "Закрыть голосование"
      : "Открыть голосование";
  }

  renderAdminOptions();
  ensureAdminVotersPanel();
  ensureAdminResultsPanel();
  installNewEventButton();

  if (currentEvent) {
    await loadAdminVoters();
    await loadHistory();
  }

  await loadGT3Records();
  await renderGT3EntryForms();

  applyEventView();
}

function renderAdminOptions() {
  $("admin-categories").innerHTML = categoryOrder.map(cat => `
    <div class="panel">
      <h2>${labels[cat]}</h2>

      <div class="field">
        <label>Добавить вариант</label>
        <input id="new-${cat}" maxlength="80" placeholder="Название варианта">
      </div>

      <button class="btn primary" data-add="${cat}">Добавить</button>

      <div class="list">
        ${categories
          .filter(option => option.category === cat)
          .map(option => `
            <div class="admin-option ${option.active ? "" : "disabled-option"}">
              <input
                type="checkbox"
                data-toggle-option="${option.id}"
                ${option.active ? "checked" : ""}
                title="Активность варианта"
              >
              <span>
                ${escapeHtml(option.label)}
                <small>${option.active ? "Активен" : "Отключён, сохранён в базе"}</small>
              </span>
              <button class="btn danger" data-delete-option="${option.id}">Удалить</button>
            </div>
          `).join("") ||
          '<div class="muted">Вариантов пока нет</div>'}
      </div>
    </div>
  `).join("");

  document.querySelectorAll("[data-add]").forEach(button => {
    button.onclick = () => addOption(button.dataset.add);
  });

  document.querySelectorAll("[data-toggle-option]").forEach(input => {
    input.onchange = () =>
      setOptionActive(input.dataset.toggleOption, input.checked);
  });

  document.querySelectorAll("[data-delete-option]").forEach(button => {
    button.onclick = () => deleteOption(button.dataset.deleteOption);
  });
}

async function addOption(cat) {
  if (!isAdmin) return;

  const label = $("new-" + cat).value.trim();
  if (!label) return;

  const { error } = await sb
    .from("options")
    .insert({ category: cat, label, active: true });

  if (error) {
    alert(error.message);
    return;
  }

  await refreshAdminData();
}

async function setOptionActive(id, active) {
  if (!isAdmin) return;

  const { error } = await sb
    .from("options")
    .update({ active })
    .eq("id", id);

  if (error) {
    alert("Не удалось изменить активность: " + error.message);
    return;
  }

  await refreshAdminData();
}

async function deleteOption(id) {
  if (!isAdmin) return;

  const option = categories.find(item => item.id === id);
  if (!option) return;

  if (!confirm(
    `Полностью удалить вариант «${option.label}» из базы?\n\n` +
    "Это действие нельзя отменить. В старых результатах название может перестать отображаться."
  )) return;

  const { error } = await sb.from("options").delete().eq("id", id);

  if (error) {
    alert("Не удалось удалить вариант: " + error.message);
    return;
  }

  await refreshAdminData();
  alert("Вариант полностью удалён.");
}

async function refreshAdminData() {
  await loadOptions();
  renderAdminOptions();

  if (currentEvent) {
    await loadAdminVoters();
    await loadVotesCount();
    await loadVoteStats();
  }

  await loadGT3Records();
  await renderGT3EntryForms();
}

function ensureAdminVotersPanel() {
  if ($("admin-voters-panel")) return;

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.id = "admin-voters-panel";

  panel.innerHTML = `
    <h2>Участники текущего вечера</h2>
    <div class="hint">
      Список голосовавших, их выборы и время отправки голоса.
      Последние голоса находятся сверху.
    </div>
    <div id="admin-voters-list" class="voter-list"></div>
  `;

  $("admin-categories").insertAdjacentElement("afterend", panel);
}

function ensureAdminResultsPanel() {
  if ($("admin-results-panel")) return;

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.id = "admin-results-panel";

  panel.innerHTML = `
    <h2>Результаты жеребьёвки</h2>
    <div class="hint">
      Удаляет только результаты двух гонок текущего вечера.
      Голоса участников, инфографика и история GT3 сохраняются.
    </div>
    <button class="btn danger" id="clear-results">Удалить результаты</button>
  `;

  $("admin-voters-panel").insertAdjacentElement("afterend", panel);
  $("clear-results").onclick = clearCurrentEventResults;
}

async function clearCurrentEventResults() {
  if (!currentEvent || !isAdmin) return;

  if (!confirm(
    "Удалить результаты жеребьёвки текущего вечера?\n\n" +
    "Голоса участников, инфографика и сохранённая история GT3 останутся."
  )) return;

  const button = $("clear-results");
  if (button) button.disabled = true;

  const { error } = await sb
    .from("events")
    .update({ result: null })
    .eq("id", currentEvent.id);

  if (error) {
    if (button) button.disabled = false;
    alert("Не удалось удалить результаты: " + error.message);
    return;
  }

  currentEvent.result = null;

  await loadResult();
  await renderGT3EntryForms();
  applyEventView();

  if (button) button.disabled = false;
  alert("Результаты жеребьёвки удалены. История GT3 сохранена.");
}

async function loadAdminVoters() {
  if (!currentEvent || !$("admin-voters-list")) return;

  const { data, error } = await sb
    .from("votes")
    .select("nickname,selections,voted_at")
    .eq("event_id", currentEvent.id)
    .order("voted_at", { ascending: false });

  if (error) {
    $("admin-voters-list").innerHTML =
      `<div class="muted">Ошибка загрузки: ${escapeHtml(error.message)}</div>`;
    return;
  }

  const votes = data || [];

  if (!votes.length) {
    $("admin-voters-list").innerHTML =
      '<div class="muted">Пока никто не проголосовал.</div>';
    return;
  }

  $("admin-voters-list").innerHTML = votes.map(vote => {
    const picks = categoryOrder.map(cat => {
      const ids = normalizedVotes(vote.selections, cat);

      const names = [...new Set(ids)].map(id => {
        const count = ids.filter(value => value === id).length;
        return optionLabel(id) + (count > 1 ? ` ×${count}` : "");
      });

      return `
        <div>
          ${labels[cat]}:
          <strong>${escapeHtml(names.join(", ") || "—")}</strong>
        </div>
      `;
    }).join("");

    return `
      <div class="voter-card">
        <div class="voter-name">${escapeHtml(vote.nickname)}</div>
        <div class="voter-time">
          Проголосовал: ${escapeHtml(formatVoteTime(vote.voted_at))}
        </div>
        <div class="voter-picks">${picks}</div>
        <div class="voter-actions">
          <button class="btn danger" data-delete-vote="${encodeURIComponent(vote.nickname)}">
            Удалить голос
          </button>
        </div>
      </div>
    `;
  }).join("");

  document.querySelectorAll("[data-delete-vote]").forEach(button => {
    button.onclick = () =>
      deleteVote(decodeURIComponent(button.dataset.deleteVote));
  });
}

async function deleteVote(nickname) {
  if (!isAdmin || !confirm(`Удалить голос участника «${nickname}»?`)) return;

  const { error } = await sb
    .from("votes")
    .delete()
    .eq("event_id", currentEvent.id)
    .eq("nickname", nickname);

  if (error) {
    alert("Не удалось удалить голос: " + error.message);
    return;
  }

  await loadAdminVoters();
  await loadVotesCount();
  await loadVoteStats();

  alert("Голос удалён. Этот ник сможет проголосовать заново.");
}

// Переименование текущего вечера.
$("save-event").onclick = async () => {
  if (!currentEvent || !isAdmin) return;

  const title = $("event-name").value.trim();
  if (!title) {
    alert("Введи название вечера.");
    return;
  }

  const { error } = await sb
    .from("events")
    .update({ title })
    .eq("id", currentEvent.id);

  if (error) {
    alert("Не удалось изменить название: " + error.message);
  } else {
    alert("Название вечера изменено.");
    await init();
  }
};

// Кнопка создания нового вечера добавляется в админку.
function installNewEventButton() {
  if ($("create-new-event") || !$("save-event")) return;

  const button = document.createElement("button");
  button.id = "create-new-event";
  button.className = "btn primary";
  button.textContent = "Создать новый вечер";
  button.style.marginTop = "10px";

  $("save-event").insertAdjacentElement("afterend", button);
  button.onclick = createNewRaceEvent;
}

async function createNewRaceEvent() {
  if (!isAdmin) return;

  const title = $("event-name").value.trim();

  if (!title) {
    alert("Введи название нового вечера.");
    return;
  }

  if (!confirm(
    `Создать новый гоночный вечер «${title}»?\n\n` +
    "Предыдущий вечер будет сохранён в истории. " +
    "Его гонки и хот-лапы останутся без изменений."
  )) return;

  const button = $("create-new-event");
  button.disabled = true;

  // Архивируем предыдущий вечер.
  if (currentEvent) {
    const { error: archiveError } = await sb
      .from("events")
      .update({ is_current: false })
      .eq("id", currentEvent.id);

    if (archiveError) {
      button.disabled = false;
      alert("Не удалось архивировать предыдущий вечер: " + archiveError.message);
      return;
    }
  }

  // Создаём новую запись, а не переименовываем старую.
  const { data: newEvent, error: createError } = await sb
    .from("events")
    .insert({
      title,
      is_current: true,
      voting_open: true,
      result: null
    })
    .select("*")
    .single();

  if (createError) {
    if (currentEvent) {
      const { error: restoreError } = await sb
        .from("events")
        .update({ is_current: true })
        .eq("id", currentEvent.id);

      if (restoreError) {
        console.error("Не удалось восстановить прежний вечер", restoreError);
      }
    }

    button.disabled = false;
    alert("Не удалось создать новый вечер: " + createError.message);
    return;
  }

  currentEvent = newEvent;
  isOpen = true;

  await init();

  alert("Новый гоночный вечер создан. Старые результаты сохранены.");
  button.disabled = false;
}

$("toggle-event").onclick = async () => {
  if (!currentEvent || !isAdmin) return;

  const { error } = await sb
    .from("events")
    .update({ voting_open: !isOpen })
    .eq("id", currentEvent.id);

  if (error) {
    alert(error.message);
  } else {
    await init();
  }
};

$("draw").onclick = async () => {
  if (!currentEvent || !isAdmin) return;

  if (!confirm("Закрыть голосование и провести жеребьёвку для двух гонок?")) {
    return;
  }

  const { error } = await sb.rpc("draw_weighted", {
    p_event_id: currentEvent.id
  });

  if (error) {
    alert(error.message);
    return;
  }

  await init();
  tab("result");
};

$("reset-votes").onclick = async () => {
  if (!currentEvent || !isAdmin) return;
  if (!confirm("Удалить все голоса текущего вечера?")) return;

  const { error } = await sb
    .from("votes")
    .delete()
    .eq("event_id", currentEvent.id);

  if (error) {
    alert(error.message);
  } else {
    await loadVotesCount();
    await loadVoteStats();
    await loadAdminVoters();
    alert("Голоса удалены");
  }
};

// GT3: загрузка гонок и отдельных кругов.
async function loadGT3Records() {
  if (!sb) return;

  const container = $("gt3-records-content");

  const [racesResponse, lapsResponse, eventsResponse] = await Promise.all([
    sb.from("gt3_race_results")
      .select("id,event_id,race_number,track_name,created_at")
      .order("created_at", { ascending: false }),

    sb.from("gt3_laps")
      .select("id,race_result_id,driver_name,lap_ms,car_name,created_at")
      .order("lap_ms", { ascending: true }),

    sb.from("events")
      .select("id,title,created_at")
  ]);

  const error = racesResponse.error || lapsResponse.error || eventsResponse.error;

  if (error) {
    console.error("Ошибка загрузки GT3-истории", error);

    if (container) {
      container.innerHTML =
        `<div class="record-empty">Не удалось загрузить историю GT3: ${escapeHtml(error.message)}</div>`;
    }
    return;
  }

  gt3Races = racesResponse.data || [];
  gt3Laps = lapsResponse.data || [];
  gt3Events = eventsResponse.data || [];

  renderGT3Records();

  if (isAdmin) {
    renderGT3AdminHistory();
    await renderGT3EntryForms();
  }
}

function sortedGT3Races() {
  return [...gt3Races].sort((a, b) => {
    const eventA = gt3Events.find(event => event.id === a.event_id);
    const eventB = gt3Events.find(event => event.id === b.event_id);

    return new Date(eventB?.created_at || b.created_at) -
      new Date(eventA?.created_at || a.created_at);
  });
}

function renderGT3Records() {
  const container = $("gt3-records-content");
  if (!container) return;

  const bestByTrack = new Map();

  gt3Races.forEach(race => {
    const key = String(race.track_name || "").trim().toLowerCase();

    getRaceLaps(race.id).forEach(lap => {
      const previous = bestByTrack.get(key);

      if (!previous || lap.lap_ms < previous.lap_ms) {
        bestByTrack.set(key, {
          ...lap,
          track_name: race.track_name
        });
      }
    });
  });

  const bestRecords = [...bestByTrack.values()]
    .sort((a, b) => a.track_name.localeCompare(b.track_name, "ru"));

  const history = sortedGT3Races();

  container.innerHTML = `
    <h3 class="record-section-title">Лучшие хот-лапы по трассам</h3>

    ${bestRecords.length ? `
      <div class="records-table-wrap">
        <table class="records-table">
          <thead>
            <tr>
              <th>Трасса</th>
              <th>Пилот</th>
              <th>Автомобиль</th>
              <th>Время</th>
            </tr>
          </thead>
          <tbody>
            ${bestRecords.map(record => `
              <tr>
                <td>${escapeHtml(record.track_name)}</td>
                <td>${escapeHtml(record.driver_name)}</td>
                <td>${escapeHtml(record.car_name || "—")}</td>
                <td class="records-time">${formatLapTime(record.lap_ms)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : `
      <div class="record-empty">Хот-лапы пока не добавлены.</div>
    `}

    <h3 class="record-section-title">История гонок и хот-лапов</h3>

    ${history.length ? `
      <div class="record-history">
        ${history.map(race => {
          const laps = getRaceLaps(race.id);

          return `
            <div class="gt3-history-card">
              <div class="gt3-history-heading">
                ${escapeHtml(getRaceTitle(race))} · Гонка ${race.race_number}
              </div>
              <div class="gt3-history-sub">
                ${escapeHtml(getRaceDate(race))} · ${escapeHtml(race.track_name)}
              </div>

              ${laps.length ? `
                <div class="gt3-lap-list">
                  ${laps.map(lap => `
                    <div class="gt3-lap-item">
                      <div class="gt3-lap-main">
                        <div class="gt3-lap-driver">${escapeHtml(lap.driver_name)}</div>
                        <div class="gt3-lap-meta">
                          ${escapeHtml(lap.car_name || "Автомобиль не указан")}
                        </div>
                      </div>
                      <div class="gt3-lap-time">${formatLapTime(lap.lap_ms)}</div>
                    </div>
                  `).join("")}
                </div>
              ` : `
                <div class="hint" style="margin-top:10px">Хот-лапы не внесены.</div>
              `}
            </div>
          `;
        }).join("")}
      </div>
    ` : `
      <div class="record-empty">История GT3 пока пуста.</div>
    `}

    <div class="hint" style="margin-top:14px">
      Учтено гонок GT3: ${gt3Races.length}. Хот-лапов: ${gt3Laps.length}.
    </div>
  `;
}

async function renderGT3EntryForms() {
  const container = $("gt3-entry-content");
  if (!container || !isAdmin) return;

  if (!currentEvent) {
    container.innerHTML = '<div class="record-empty">Нет активного гоночного вечера.</div>';
    return;
  }

  const result = currentEvent.result;

  if (!result) {
    container.innerHTML = '<div class="record-empty">Сначала проведи жеребьёвку.</div>';
    return;
  }

  const tracks = resultValues(result.track);
  const classes = resultValues(result.car_class);

  const races = [0, 1].map(index => ({
    number: index + 1,
    track: optionLabel(tracks[index] ?? tracks[0] ?? "—"),
    carClass: optionLabel(classes[index] ?? classes[0] ?? "—"),
    isGT3: isGT3Class(classes[index] ?? classes[0])
  }));

  const gt3Only = races.filter(race => race.isGT3);

  if (!gt3Only.length) {
    container.innerHTML = `
      <div class="record-empty">
        В этом вечере не выпал класс GT3. Результаты не будут добавлены в GT3-статистику.
      </div>
    `;
    return;
  }

  container.innerHTML = gt3Only.map(race => {
    const saved = gt3Races.find(item =>
      item.event_id === currentEvent.id &&
      item.race_number === race.number
    );

    const laps = saved ? getRaceLaps(saved.id) : [];

    return `
      <div class="gt3-race-card">
        <h3>Гонка ${race.number} · ${escapeHtml(race.track)}</h3>
        <div class="hint">Класс: ${escapeHtml(race.carClass)}</div>

        <div class="gt3-lap-edit">
          <input id="new-lap-driver-${race.number}" maxlength="50" placeholder="Ник пилота">
          <input id="new-lap-time-${race.number}" maxlength="12" placeholder="Время 1:42.381">
          <input id="new-lap-car-${race.number}" maxlength="80" placeholder="Автомобиль">
        </div>

        <div class="actions">
          <button class="btn primary" data-add-lap="${race.number}">
            Добавить хот-лап
          </button>
        </div>

        ${saved && laps.length ? `
          <div class="record-section-title">Круги этой гонки (${laps.length})</div>
          <div class="gt3-lap-list">
            ${laps.map(lap => `
              <div class="gt3-lap-item">
                <div class="gt3-lap-main">
                  <div class="gt3-lap-driver">${escapeHtml(lap.driver_name)}</div>
                  <div class="gt3-lap-meta">${escapeHtml(lap.car_name || "Автомобиль не указан")}</div>
                  <div class="gt3-lap-time">${formatLapTime(lap.lap_ms)}</div>
                </div>
                <div class="record-actions">
                  <button class="btn" data-edit-lap="${lap.id}">Изменить</button>
                  <button class="btn danger" data-delete-lap="${lap.id}">Удалить</button>
                </div>
              </div>
            `).join("")}
          </div>
        ` : `
          <div class="record-empty" style="margin-top:10px">
            Хот-лапы этой гонки пока не добавлены.
          </div>
        `}
      </div>
    `;
  }).join("");

  document.querySelectorAll("[data-add-lap]").forEach(button => {
    button.onclick = () => addGT3Lap(Number(button.dataset.addLap));
  });

  document.querySelectorAll("[data-edit-lap]").forEach(button => {
    button.onclick = () => focusGT3AdminLap(button.dataset.editLap);
  });

  document.querySelectorAll("[data-delete-lap]").forEach(button => {
    button.onclick = () => deleteGT3Lap(button.dataset.deleteLap);
  });
}

async function addGT3Lap(raceNumber) {
  if (!isAdmin || !currentEvent) return;

  const result = currentEvent.result;
  if (!result) {
    alert("Сначала проведи жеребьёвку.");
    return;
  }

  const tracks = resultValues(result.track);
  const classes = resultValues(result.car_class);
  const classId = classes[raceNumber - 1] ?? classes[0];

  if (!isGT3Class(classId)) {
    alert("Эта гонка не относится к GT3.");
    return;
  }

  const trackName = optionLabel(tracks[raceNumber - 1] ?? tracks[0] ?? "—");
  const driver = $(`new-lap-driver-${raceNumber}`).value.trim();
  const timeText = $(`new-lap-time-${raceNumber}`).value.trim();
  const car = $(`new-lap-car-${raceNumber}`).value.trim();

  if (!driver || !timeText) {
    alert("Заполни ник пилота и время круга.");
    return;
  }

  const lapMs = parseLapTime(timeText);
  if (!lapMs) {
    alert("Неверный формат времени. Используй формат 1:42.381");
    return;
  }

  const button = document.querySelector(`[data-add-lap="${raceNumber}"]`);
  if (button) button.disabled = true;

  const { data: race, error: raceError } = await sb
    .from("gt3_race_results")
    .upsert({
      event_id: currentEvent.id,
      race_number: raceNumber,
      track_name: trackName
    }, {
      onConflict: "event_id,race_number"
    })
    .select("id")
    .single();

  if (raceError) {
    if (button) button.disabled = false;
    alert("Не удалось сохранить гонку GT3: " + raceError.message);
    return;
  }

  const { error } = await sb.from("gt3_laps").insert({
    race_result_id: race.id,
    driver_name: driver,
    lap_ms: lapMs,
    car_name: car
  });

  if (error) {
    if (button) button.disabled = false;
    alert("Не удалось добавить хот-лап: " + error.message);
    return;
  }

  await loadGT3Records();
  alert("Хот-лап добавлен в историю.");
}

function focusGT3AdminLap(lapId) {
  if (!isAdmin) return;

  tab("gt3-admin");

  setTimeout(() => {
    const field = $(`history-lap-driver-${lapId}`);
    if (field) {
      field.scrollIntoView({ behavior: "smooth", block: "center" });
      field.focus();
    }
  }, 50);
}

async function deleteGT3Lap(lapId) {
  if (!isAdmin) return;

  const lap = gt3Laps.find(item => item.id === lapId);
  if (!lap) return;

  if (!confirm(
    `Удалить хот-лап ${lap.driver_name} — ${formatLapTime(lap.lap_ms)}?\n\nЭто действие нельзя отменить.`
  )) return;

  const { error } = await sb
    .from("gt3_laps")
    .delete()
    .eq("id", lapId);

  if (error) {
    alert("Не удалось удалить хот-лап: " + error.message);
    return;
  }

  await loadGT3Records();
  alert("Хот-лап удалён. Рекорды пересчитаны.");
}

function renderGT3AdminHistory() {
  const container = $("gt3-admin-history-content");
  if (!container || !isAdmin) return;

  if (!gt3Races.length) {
    container.innerHTML = '<div class="record-empty">История GT3 пока пуста.</div>';
    return;
  }

  container.innerHTML = sortedGT3Races().map(race => {
    const laps = getRaceLaps(race.id);

    return `
      <div class="gt3-history-card">
        <div class="gt3-history-heading">
          ${escapeHtml(getRaceTitle(race))} · Гонка ${race.race_number}
        </div>
        <div class="gt3-history-sub">${escapeHtml(getRaceDate(race))}</div>

        <div class="field">
          <label>Трасса</label>
          <input
            id="history-track-${race.id}"
            maxlength="100"
            value="${escapeHtml(race.track_name)}"
          >
        </div>
        <div class="gt3-lap-actions">
          <button class="btn primary" data-save-race-history="${race.id}">
            Сохранить трассу
          </button>
        </div>

        <div class="record-section-title">Хот-лапы (${laps.length})</div>

        ${laps.length ? laps.map(lap => `
          <div class="gt3-history-lap" id="history-lap-card-${lap.id}">
            <div class="gt3-admin-fields">
              <div class="field">
                <label>Пилот</label>
                <input
                  id="history-lap-driver-${lap.id}"
                  maxlength="50"
                  value="${escapeHtml(lap.driver_name)}"
                >
              </div>
              <div class="field">
                <label>Время</label>
                <input
                  id="history-lap-time-${lap.id}"
                  maxlength="12"
                  value="${formatLapTime(lap.lap_ms)}"
                >
              </div>
              <div class="field">
                <label>Автомобиль</label>
                <input
                  id="history-lap-car-${lap.id}"
                  maxlength="80"
                  value="${escapeHtml(lap.car_name || "")}"
                >
              </div>
            </div>
            <div class="gt3-lap-actions">
              <button class="btn primary" data-save-history-lap="${lap.id}">
                Сохранить круг
              </button>
              <button class="btn danger" data-delete-history-lap="${lap.id}">
                Удалить круг
              </button>
            </div>
          </div>
        `).join("") : `
          <div class="hint">В этой гонке пока нет хот-лапов.</div>
        `}

        <div class="gt3-admin-add">
          <h4>Добавить круг в эту гонку</h4>
          <div class="gt3-lap-edit">
            <input id="history-new-driver-${race.id}" maxlength="50" placeholder="Ник пилота">
            <input id="history-new-time-${race.id}" maxlength="12" placeholder="Время 1:42.381">
            <input id="history-new-car-${race.id}" maxlength="80" placeholder="Автомобиль">
          </div>
          <div class="gt3-lap-actions">
            <button class="btn primary" data-add-history-lap="${race.id}">
              Добавить круг
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  document.querySelectorAll("[data-save-race-history]").forEach(button => {
    button.onclick = () => updateGT3RaceHistory(button.dataset.saveRaceHistory);
  });

  document.querySelectorAll("[data-save-history-lap]").forEach(button => {
    button.onclick = () => updateGT3LapHistory(button.dataset.saveHistoryLap);
  });

  document.querySelectorAll("[data-delete-history-lap]").forEach(button => {
    button.onclick = () => deleteGT3Lap(button.dataset.deleteHistoryLap);
  });

  document.querySelectorAll("[data-add-history-lap]").forEach(button => {
    button.onclick = () => addHistoricalGT3Lap(button.dataset.addHistoryLap);
  });
}

async function updateGT3RaceHistory(raceId) {
  if (!isAdmin) return;

  const trackName = $(`history-track-${raceId}`).value.trim();
  if (!trackName) {
    alert("Укажи название трассы.");
    return;
  }

  const { error } = await sb
    .from("gt3_race_results")
    .update({ track_name: trackName })
    .eq("id", raceId);

  if (error) {
    alert("Не удалось обновить трассу: " + error.message);
    return;
  }

  await loadGT3Records();
  alert("Трасса обновлена. Рекорды пересчитаны.");
}

async function updateGT3LapHistory(lapId) {
  if (!isAdmin) return;

  const driver = $(`history-lap-driver-${lapId}`).value.trim();
  const timeText = $(`history-lap-time-${lapId}`).value.trim();
  const car = $(`history-lap-car-${lapId}`).value.trim();
  const lapMs = parseLapTime(timeText);

  if (!driver || !lapMs) {
    alert("Проверь имя пилота и формат времени.");
    return;
  }

  const { error } = await sb
    .from("gt3_laps")
    .update({
      driver_name: driver,
      lap_ms: lapMs,
      car_name: car
    })
    .eq("id", lapId);

  if (error) {
    alert("Не удалось обновить круг: " + error.message);
    return;
  }

  await loadGT3Records();
  alert("Хот-лап обновлён. Рекорды пересчитаны.");
}

async function addHistoricalGT3Lap(raceId) {
  if (!isAdmin) return;

  const driver = $(`history-new-driver-${raceId}`).value.trim();
  const timeText = $(`history-new-time-${raceId}`).value.trim();
  const car = $(`history-new-car-${raceId}`).value.trim();
  const lapMs = parseLapTime(timeText);

  if (!driver || !lapMs) {
    alert("Заполни ник пилота и корректное время круга.");
    return;
  }

  const { error } = await sb.from("gt3_laps").insert({
    race_result_id: raceId,
    driver_name: driver,
    lap_ms: lapMs,
    car_name: car
  });

  if (error) {
    alert("Не удалось добавить круг: " + error.message);
    return;
  }

  await loadGT3Records();
  alert("Круг добавлен в историю.");
}

async function loadResult() {
  if (!currentEvent) return;

  const { data, error } = await sb
    .from("events")
    .select("result")
    .eq("id", currentEvent.id)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  const result = data?.result;
  currentEvent.result = result || null;

  if (!result) {
    $("result-card").innerHTML = `
      <div class="eyebrow">RACE RANDOMIZER</div>
      <h2>Ждём жеребьёвку</h2>
      <p>Результат появится после выбора администратора.</p>
    `;
    return;
  }

  const tracks = resultValues(result.track);
  const classes = resultValues(result.car_class);
  const weather = resultValues(result.weather);

  $("result-card").innerHTML = `
    <div class="eyebrow">RACE NIGHT / RESULTS</div>
    <div class="cols" style="margin-top:12px">
      ${[0, 1].map(index => {
        const trackName = optionLabel(tracks[index] ?? tracks[0] ?? "—");
        const carClass = optionLabel(classes[index] ?? classes[0] ?? "—");
        const weatherName = optionLabel(weather[index] ?? weather[0] ?? "—");
        const record = getBestRecord(trackName);

        return `
          <div class="panel">
            <div class="eyebrow">RACE ${index + 1}</div>
            <h2>${escapeHtml(trackName)}</h2>
            <p>Класс: <strong>${escapeHtml(carClass)}</strong></p>
            <p>Погода: <strong>${escapeHtml(weatherName)}</strong></p>

            ${isGT3Class(classes[index] ?? classes[0]) ? `
              <div class="record-highlight">
                <div class="record-label">ЛУЧШИЙ КРУГ GT3</div>
                ${record ? `
                  <div class="record-line">
                    <div>
                      <div class="record-driver">
                        ${escapeHtml(record.driver_name)}
                        · ${escapeHtml(record.car_name || "Автомобиль не указан")}
                      </div>
                    </div>
                    <div class="record-time">${formatLapTime(record.lap_ms)}</div>
                  </div>
                ` : `
                  <div class="record-driver" style="margin-top:5px">
                    Рекорд ещё не установлен
                  </div>
                `}
              </div>
            ` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function loadVoteStats() {
  if (!currentEvent) return;

  const { data, error } = await sb
    .from("votes")
    .select("nickname,selections")
    .eq("event_id", currentEvent.id);

  if (error) {
    console.error("Ошибка загрузки статистики", error);
    $("vote-stats-content").innerHTML =
      '<div class="muted">Не удалось загрузить статистику голосов.</div>';
    return;
  }

  const votes = data || [];

  if (!votes.length) {
    $("vote-stats-content").innerHTML =
      '<div class="muted">Пока никто не проголосовал.</div>';
    return;
  }

  let html = "";

  for (const cat of categoryOrder) {
    const tally = {};

    votes.forEach(vote => {
      normalizedVotes(vote.selections, cat).forEach(id => {
        tally[id] = (tally[id] || 0) + 1;
      });
    });

    const entries = Object.entries(tally)
      .map(([id, count]) => ({ id, count, label: optionLabel(id) }))
      .sort((a, b) => b.count - a.count);

    const total = entries.reduce((sum, item) => sum + item.count, 0);

    html += `
      <div class="stats-category">
        <h3>${labels[cat]}</h3>
        ${entries.length ? entries.map(item => {
          const percent = total ? Math.round(item.count / total * 100) : 0;

          return `
            <div class="stat-row">
              <div class="stat-name">${escapeHtml(item.label)}</div>
              <div class="stat-track">
                <div class="stat-fill" style="width:${percent}%"></div>
              </div>
              <div class="stat-value">${item.count} · ${percent}%</div>
            </div>
          `;
        }).join("") : '<div class="muted">Нет голосов в этой категории.</div>'}
        <div class="hint">Всего голосов в категории: ${total}</div>
      </div>
    `;
  }

  const votersHtml = votes.map(vote => {
    const picks = categoryOrder.map(cat => {
      const ids = normalizedVotes(vote.selections, cat);

      const names = [...new Set(ids)].map(id => {
        const count = ids.filter(value => value === id).length;
        return optionLabel(id) + (count > 1 ? ` ×${count}` : "");
      });

      return `
        <div>
          ${labels[cat]}:
          <strong>${escapeHtml(names.join(", ") || "—")}</strong>
        </div>
      `;
    }).join("");

    return `
      <div class="voter-card">
        <div class="voter-name">${escapeHtml(vote.nickname)}</div>
        <div class="voter-picks">${picks}</div>
      </div>
    `;
  }).join("");

  $("vote-stats-content").innerHTML = `
    <div class="hint">
      Участников: ${votes.length}.
      Каждый участник даёт до двух голосов в каждой категории.
    </div>
    ${html}
    <div class="stats-category">
      <h3>Кто за что проголосовал</h3>
      <div class="voter-list">${votersHtml}</div>
    </div>
  `;
}

async function loadHistory() {
  if (!currentEvent) return;

  const { data, error } = await sb
    .from("events")
    .select("title,result,created_at")
    .eq("is_current", false)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  $("history").innerHTML = (data || []).map(event => {
    const tracks = resultValues(event.result?.track);
    const trackNames = tracks.map(optionLabel).join(" / ");

    return `
      <div class="item">
        <span>
          ${escapeHtml(event.title)} ·
          ${event.result ? escapeHtml(trackNames) : "Без результата"}
        </span>
        <small class="muted">
          ${new Date(event.created_at).toLocaleDateString("ru-RU")}
        </small>
      </div>
    `;
  }).join("") || '<div class="muted">История пока пуста</div>';
}

if (sb) {
  sb.auth.getSession().then(({ data }) => {
    currentUser = data.session?.user || null;
    init();
  });

  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
  });
} else {
  init();
}
