
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
let gt3Records = [];

const categoryOrder = ["track", "car_class", "weather"];

const labels = {
  track: "Трасса",
  car_class: "Класс автомобиля",
  weather: "Погода"
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
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
  if (!ms || !Number.isFinite(Number(ms))) return "—";

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

function getBestRecord(trackName) {
  return gt3Records
    .filter(record =>
      record.track_name.trim().toLowerCase() ===
      String(trackName).trim().toLowerCase()
    )
    .sort((a, b) => a.hotlap_ms - b.hotlap_ms)[0] || null;
}

function installExtraStyles() {
  if ($("extra-styles")) return;

  const style = document.createElement("style");
  style.id = "extra-styles";
  style.textContent = `
    .voter-list {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }

    .voter-card {
      padding: 13px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #0d1720;
    }

    .voter-name {
      font-weight: 800;
      margin-bottom: 5px;
    }

    .voter-time {
      font-size: 11px;
      color: var(--accent);
      margin-bottom: 9px;
    }

    .voter-picks {
      display: grid;
      gap: 5px;
      font-size: 13px;
      color: var(--muted);
    }

    .voter-picks strong {
      color: var(--text);
    }

    .admin-option {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 11px;
      margin-top: 8px;
    }

    .admin-option input {
      width: auto;
      flex: 0 0 auto;
      margin: 0;
      accent-color: var(--accent);
    }

    .admin-option span {
      flex: 1;
      min-width: 0;
    }

    .admin-option small {
      display: block;
      color: var(--muted);
      font-size: 10px;
    }

    .admin-option.disabled-option {
      opacity: .55;
    }

    .voter-actions {
      margin-top: 10px;
      display: flex;
      justify-content: flex-end;
    }

    .voter-actions button,
    .admin-option button {
      font-size: 12px;
    }

    .admin-option button {
      flex: 0 0 auto;
    }
  `;

  document.head.appendChild(style);
}

// После жеребьёвки публичным пользователям доступны
// результаты и рекорды, но не голосование и админка.
function applyEventView() {
  const hasDrawResult = Boolean(currentEvent?.result);
  const publicResultsOnly = hasDrawResult && !isAdmin;

  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle(
      "hidden",
      publicResultsOnly &&
      ["vote", "admin"].includes(button.dataset.tab)
    );
  });

  if (publicResultsOnly) {
    $("vote").classList.add("hidden");
    $("admin").classList.add("hidden");

    document.querySelectorAll(".tab").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.tab ===
          ( $("records").classList.contains("hidden") ? "result" : "records" )
      );
    });
  }
}

function tab(name) {
  if (
    currentEvent?.result &&
    !isAdmin &&
    ["vote", "admin"].includes(name)
  ) {
    name = "result";
  }

  document.querySelectorAll(".tab").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === name)
  );

  ["vote", "result", "records", "admin"].forEach(x =>
    $(x).classList.toggle("hidden", x !== name)
  );

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

  applyEventView();
}

document.querySelectorAll(".tab").forEach(b => {
  b.onclick = () => tab(b.dataset.tab);
});

function msg(id, text) {
  $(id).textContent = text;
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
    $("connection").textContent =
      "Создай гоночный вечер в SQL / админке";
    await loadGT3Records();
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

  if (currentUser) {
    await loadAdmin();
  }

  if (!currentEvent.result && !isAdmin) {
    tab("vote");
  }

  applyEventView();
}

// Загружаем все варианты, в том числе отключённые.
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
          .filter(o => o.category === cat && o.active)
          .map(o => `
            <label class="option">
              <input type="checkbox" name="${cat}" value="${o.id}">
              <span>${escapeHtml(o.label)}</span>
            </label>
          `).join("") ||
          '<div class="muted">Пока нет активных вариантов</div>'}
      </div>
    </div>
  `).join("");

  categoryOrder.forEach(cat => {
    document.querySelectorAll(`input[name="${cat}"]`)
      .forEach(input => {
        input.addEventListener("change", () => {
          const checked = document.querySelectorAll(
            `input[name="${cat}"]:checked`
          );

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

// Голосование: только INSERT.
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
    ].map(el => el.value);

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

  const { error } = await sb
    .from("votes")
    .insert({
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

// Авторизация администратора.
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
};

$("logout").onclick = async () => {
  await sb.auth.signOut();

  currentUser = null;
  isAdmin = false;

  $("admin-panel").classList.add("hidden");
  $("login-panel").classList.remove("hidden");

  applyEventView();
};

async function loadAdmin() {
  if (!currentUser || !currentEvent) return;

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

  $("event-name").value = currentEvent.title;

  $("toggle-event").textContent = isOpen
    ? "Закрыть голосование"
    : "Открыть голосование";

  renderAdminOptions();
  ensureAdminVotersPanel();

  await loadAdminVoters();
  ensureAdminResultsPanel();
  await loadHistory();
  await renderGT3EntryForms();

  applyEventView();
}

// Варианты в админке.
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
          .filter(o => o.category === cat)
          .map(o => `
            <div class="admin-option ${o.active ? "" : "disabled-option"}">
              <input
                type="checkbox"
                data-toggle-option="${o.id}"
                ${o.active ? "checked" : ""}
                title="Активность варианта"
              >
              <span>
                ${escapeHtml(o.label)}
                <small>${o.active ? "Активен" : "Отключён, сохранён в базе"}</small>
              </span>
              <button class="btn danger" data-delete-option="${o.id}">
                Удалить
              </button>
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
    button.onclick = () =>
      deleteOption(button.dataset.deleteOption);
  });
}

async function addOption(cat) {
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
  const option = categories.find(o => o.id === id);
  if (!option) return;

  const confirmed = confirm(
    `Полностью удалить вариант «${option.label}» из базы?\n\n` +
    "Это действие нельзя отменить. В старых результатах название может перестать отображаться."
  );

  if (!confirmed) return;

  const { error } = await sb
    .from("options")
    .delete()
    .eq("id", id);

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
  await loadAdminVoters();
  await loadVotesCount();
  await loadVoteStats();
  await renderGT3EntryForms();
}

// Панель участников.
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

// Панель очистки результатов жеребьёвки.
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
  if (!currentEvent) return;

  const confirmed = confirm(
    "Удалить результаты жеребьёвки текущего вечера?\n\n" +
    "Голоса участников, инфографика и сохранённая история GT3 останутся."
  );

  if (!confirmed) return;

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
        const count = ids.filter(x => x === id).length;
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
  if (!confirm(`Удалить голос участника «${nickname}»?`)) return;

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

$("save-event").onclick = async () => {
  const title = $("event-name").value.trim();
  if (!title) return;

  const { error } = await sb
    .from("events")
    .update({ title })
    .eq("id", currentEvent.id);

  if (error) {
    alert(error.message);
  } else {
    await init();
  }
};

$("toggle-event").onclick = async () => {
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

// Загружаем результаты GT3.
async function loadGT3Records() {
  const { data, error } = await sb
    .from("gt3_race_results")
    .select("id,event_id,race_number,track_name,winner_name,hotlap_driver,hotlap_ms,car_name,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Ошибка загрузки GT3-рекордов", error);

    $("gt3-records-content").innerHTML =
      `<div class="record-empty">Не удалось загрузить рекорды: ${escapeHtml(error.message)}</div>`;

    return;
  }

  gt3Records = data || [];

  renderGT3Records();
}

function renderGT3Records() {
  const container = $("gt3-records-content");
  if (!container) return;

  if (!gt3Records.length) {
    container.innerHTML = `
      <div class="record-empty">
        Пока нет сохранённых результатов GT3. Первый гоночный вечер откроет историю рекордов.
      </div>
    `;
    return;
  }

  // Лучший хот-лап на каждой трассе.
  const bestByTrack = new Map();

  gt3Records.forEach(record => {
    const key = record.track_name.trim().toLowerCase();
    const previous = bestByTrack.get(key);

    if (!previous || record.hotlap_ms < previous.hotlap_ms) {
      bestByTrack.set(key, record);
    }
  });

  const bestRecords = [...bestByTrack.values()]
    .sort((a, b) => a.track_name.localeCompare(b.track_name, "ru"));

  // Количество побед каждого гонщика.
  const wins = {};

  gt3Records.forEach(record => {
    const name = record.winner_name.trim();
    if (!name) return;

    wins[name] = (wins[name] || 0) + 1;
  });

  const leaderboard = Object.entries(wins)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));

  container.innerHTML = `
    <h3 class="record-section-title">Лучшие хот-лапы по трассам</h3>

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
              <td>${escapeHtml(record.hotlap_driver)}</td>
              <td>${escapeHtml(record.car_name || "—")}</td>
              <td class="records-time">${formatLapTime(record.hotlap_ms)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <h3 class="record-section-title">Рейтинг победителей GT3</h3>

    <div class="records-table-wrap">
      <table class="records-table">
        <thead>
          <tr>
            <th>Место</th>
            <th>Гонщик</th>
            <th>Победы</th>
          </tr>
        </thead>
        <tbody>
          ${leaderboard.map((item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item.name)}</td>
              <td>${item.count}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="hint" style="margin-top:12px">
      Учтено гонок GT3: ${gt3Records.length}.
    </div>
  `;
}

// Админская форма внесения результатов.
async function renderGT3EntryForms() {
  const container = $("gt3-entry-content");
  if (!container || !currentEvent || !isAdmin) return;

  const result = currentEvent.result;

  if (!result) {
    container.innerHTML =
      '<div class="record-empty">Сначала проведи жеребьёвку.</div>';
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

  const gt3Races = races.filter(race => race.isGT3);

  if (!gt3Races.length) {
    container.innerHTML = `
      <div class="record-empty">
        В этом вечере не выпал класс GT3. Результаты не будут добавлены в GT3-статистику.
      </div>
    `;
    return;
  }

  const { data: saved, error } = await sb
    .from("gt3_race_results")
    .select("*")
    .eq("event_id", currentEvent.id);

  if (error) {
    container.innerHTML =
      `<div class="record-empty">Ошибка загрузки сохранённых результатов: ${escapeHtml(error.message)}</div>`;
    return;
  }

  container.innerHTML = gt3Races.map(race => {
    const old = (saved || []).find(item => item.race_number === race.number);

    return `
      <div class="admin-race-form">
        <h3>Гонка ${race.number} · ${escapeHtml(race.track)}</h3>
        <div class="hint">Класс: ${escapeHtml(race.carClass)}</div>

        <div class="field">
          <label>Победитель</label>
          <input
            id="gt3-winner-${race.number}"
            maxlength="50"
            placeholder="Ник победителя"
            value="${escapeHtml(old?.winner_name || "")}"
          >
        </div>

        <div class="field">
          <label>Обладатель хот-лапа</label>
          <input
            id="gt3-driver-${race.number}"
            maxlength="50"
            placeholder="Ник обладателя лучшего круга"
            value="${escapeHtml(old?.hotlap_driver || "")}"
          >
        </div>

        <div class="field">
          <label>Время хот-лапа (например, 1:42.381)</label>
          <input
            id="gt3-time-${race.number}"
            maxlength="12"
            placeholder="1:42.381"
            value="${old ? formatLapTime(old.hotlap_ms) : ""}"
          >
        </div>

        <div class="field">
          <label>Автомобиль</label>
          <input
            id="gt3-car-${race.number}"
            maxlength="80"
            placeholder="Например, BMW M4 GT3"
            value="${escapeHtml(old?.car_name || "")}"
          >
        </div>

        <div class="actions">
          <button class="btn primary" data-save-gt3="${race.number}">
            ${old ? "Обновить результат" : "Сохранить результат"}
          </button>
        </div>
      </div>
    `;
  }).join("");

  document.querySelectorAll("[data-save-gt3]").forEach(button => {
    button.onclick = () =>
      saveGT3RaceResult(Number(button.dataset.saveGt3));
  });
}

async function saveGT3RaceResult(raceNumber) {
  if (!currentEvent || !isAdmin) return;

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

  const trackName = optionLabel(
    tracks[raceNumber - 1] ?? tracks[0] ?? "—"
  );

  const winner = $(`gt3-winner-${raceNumber}`).value.trim();
  const driver = $(`gt3-driver-${raceNumber}`).value.trim();
  const timeText = $(`gt3-time-${raceNumber}`).value.trim();
  const car = $(`gt3-car-${raceNumber}`).value.trim();

  if (!winner || !driver || !timeText) {
    alert("Заполни победителя, обладателя хот-лапа и время.");
    return;
  }

  const lapMs = parseLapTime(timeText);

  if (!lapMs) {
    alert("Неверный формат времени. Используй формат 1:42.381");
    return;
  }

  const button = document.querySelector(
    `[data-save-gt3="${raceNumber}"]`
  );

  if (button) button.disabled = true;

  const { error } = await sb
    .from("gt3_race_results")
    .upsert({
      event_id: currentEvent.id,
      race_number: raceNumber,
      track_name: trackName,
      winner_name: winner,
      hotlap_driver: driver,
      hotlap_ms: lapMs,
      car_name: car
    }, {
      onConflict: "event_id,race_number"
    });

  if (error) {
    if (button) button.disabled = false;
    alert("Не удалось сохранить результат: " + error.message);
    return;
  }

  await loadGT3Records();
  await renderGT3EntryForms();
  await loadResult();

  alert(`Результат гонки ${raceNumber} сохранён.`);
}

// Выводим текущую жеребьёвку и рекорд GT3 под каждой трассой.
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

  const r = data?.result;
  currentEvent.result = r || null;

  if (!r) {
    $("result-card").innerHTML = `
      <div class="eyebrow">RACE RANDOMIZER</div>
      <h2>Ждём жеребьёвку</h2>
      <p>Результат появится после выбора администратора.</p>
    `;
    return;
  }

  const tracks = resultValues(r.track);
  const classes = resultValues(r.car_class);
  const weather = resultValues(r.weather);

  $("result-card").innerHTML = `
    <div class="eyebrow">RACE NIGHT / RESULTS</div>
    <div class="cols" style="margin-top:12px">
      ${[0, 1].map(i => {
        const trackName = optionLabel(
          tracks[i] ?? tracks[0] ?? "—"
        );

        const carClass = optionLabel(
          classes[i] ?? classes[0] ?? "—"
        );

        const weatherName = optionLabel(
          weather[i] ?? weather[0] ?? "—"
        );

        const record = getBestRecord(trackName);

        return `
          <div class="panel">
            <div class="eyebrow">RACE ${i + 1}</div>
            <h2>${escapeHtml(trackName)}</h2>

            <p>Класс:
              <strong>${escapeHtml(carClass)}</strong>
            </p>

            <p>Погода:
              <strong>${escapeHtml(weatherName)}</strong>
            </p>

            ${isGT3Class(classes[i] ?? classes[0]) ? `
              <div class="record-highlight">
                <div class="record-label">ЛУЧШИЙ КРУГ GT3</div>
                ${record ? `
                  <div class="record-line">
                    <div>
                      <div class="record-driver">
                        ${escapeHtml(record.hotlap_driver)}
                        · ${escapeHtml(record.car_name || "Автомобиль не указан")}
                      </div>
                    </div>
                    <div class="record-time">${formatLapTime(record.hotlap_ms)}</div>
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
      .map(([id, count]) => ({
        id,
        count,
        label: optionLabel(id)
      }))
      .sort((a, b) => b.count - a.count);

    const total = entries.reduce((sum, item) => sum + item.count, 0);

    html += `
      <div class="stats-category">
        <h3>${labels[cat]}</h3>

        ${entries.length ? entries.map(item => {
          const percent = total
            ? Math.round(item.count / total * 100)
            : 0;

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
        const count = ids.filter(x => x === id).length;
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

  $("history").innerHTML = (data || []).map(e => {
    const track = resultValues(e.result?.track);
    const trackNames = track.map(optionLabel).join(" / ");

    return `
      <div class="item">
        <span>
          ${escapeHtml(e.title)} ·
          ${e.result ? escapeHtml(trackNames) : "Без результата"}
        </span>
        <small class="muted">
          ${new Date(e.created_at).toLocaleDateString("ru-RU")}
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
