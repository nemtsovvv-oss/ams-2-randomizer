
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
let isOpen = true;

const categoryOrder = ["track", "car_class", "weather"];

const labels = {
  track: "Трасса",
  car_class: "Класс автомобиля",
  weather: "Погода"
};

// Дополнительные стили для списка голосовавших.
function installExtraStyles() {
  if ($("extra-styles")) return;

  const style = document.createElement("style");
  style.id = "extra-styles";
  style.textContent = `
    .voter-list {
      display: grid;
      gap: 10px;
      margin-top: 16px;
    }

    .voter-card {
      padding: 13px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #0d1720;
    }

    .voter-name {
      font-weight: 800;
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
      opacity: .65;
    }

    .admin-option.active-option {
      opacity: 1;
    }

    .admin-option small {
      display: block;
      color: var(--muted);
      font-size: 10px;
      margin-top: 2px;
    }
  `;
  document.head.appendChild(style);
}

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

function tab(name) {
  document.querySelectorAll(".tab").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === name)
  );

  ["vote", "result", "admin"].forEach(x =>
    $(x).classList.toggle("hidden", x !== name)
  );

  if (name === "result" && currentEvent) {
    loadResult();
    loadVoteStats();
  }
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

  if (!ev) {
    $("connection").textContent = "Создай гоночный вечер в SQL / админке";
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
  await loadResult();
  await loadVoteStats();

  if (currentUser) {
    await loadAdmin();
  }
}

async function loadOptions() {
  // Загружаем ВСЕ варианты, чтобы видеть и неактивные
  // в админке, результатах и истории.
  const { data, error } = await sb
    .from("options")
    .select("id,category,label,active")
    .order("sort_order");

  if (error) {
    showError("Ошибка загрузки вариантов", error);
    return;
  }

  categories = data || [];

  // В голосовании показываем только активные варианты.
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
              <input
                type="checkbox"
                name="${cat}"
                value="${o.id}"
                data-category="${cat}"
              >
              <span>${escapeHtml(o.label)}</span>
            </label>
          `).join("") ||
          '<div class="muted">Пока нет активных вариантов</div>'}
      </div>
    </div>
  `).join("");

  // Ограничение: максимум два выбора в каждой категории.
  categoryOrder.forEach(cat => {
    document.querySelectorAll(`input[name="${cat}"]`).forEach(input => {
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

    if (checked.length === 1) {
      selections[cat] = [checked[0], checked[0]];
    } else {
      selections[cat] = checked;
    }
  }

  if (!categoryOrder.some(cat => selections[cat].length > 0)) {
    alert("Выбери хотя бы один вариант.");
    return;
  }

  const { error } = await sb
    .from("votes")
    .upsert(
      {
        event_id: currentEvent.id,
        nickname,
        selections
      },
      { onConflict: "event_id,nickname" }
    );

  if (error) {
    alert("Не удалось сохранить голос: " + error.message);
    return;
  }

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
};

$("logout").onclick = async () => {
  await sb.auth.signOut();
  currentUser = null;
  $("admin-panel").classList.add("hidden");
  $("login-panel").classList.remove("hidden");
};

async function loadAdmin() {
  $("login-panel").classList.add("hidden");
  $("admin-panel").classList.remove("hidden");

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
    msg("login-message", "У этого аккаунта нет прав администратора.");

    await sb.auth.signOut();
    currentUser = null;

    $("admin-panel").classList.add("hidden");
    $("login-panel").classList.remove("hidden");
    return;
  }

  $("event-name").value = currentEvent.title;

  $("toggle-event").textContent = isOpen
    ? "Закрыть голосование"
    : "Открыть голосование";

  $("admin-categories").innerHTML = categoryOrder.map(cat => `
    <div class="panel">
      <h2>${labels[cat]}</h2>

      <div class="field">
        <label>Добавить вариант</label>
        <input
          id="new-${cat}"
          maxlength="80"
          placeholder="Название варианта"
        >
      </div>

      <button class="btn primary" data-add="${cat}">
        Добавить
      </button>

      <div class="list">
        ${categories
          .filter(o => o.category === cat)
          .map(o => `
            <label class="option admin-option ${o.active ? "active-option" : ""}">
              <input
                type="checkbox"
                data-toggle-option="${o.id}"
                ${o.active ? "checked" : ""}
              >
              <span>
                ${escapeHtml(o.label)}
                <small>${o.active ? "Активен — доступен для голосования" : "Отключён — сохранён в базе"}</small>
              </span>
            </label>
          `).join("") ||
          '<div class="muted">Вариантов пока нет</div>'}
      </div>
    </div>
  `).join("");

  document.querySelectorAll("[data-add]").forEach(b => {
    b.onclick = () => addOption(b.dataset.add);
  });

  document.querySelectorAll("[data-toggle-option]").forEach(input => {
    input.onchange = () =>
      setOptionActive(input.dataset.toggleOption, input.checked);
  });

  await loadHistory();
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

  await init();
}

async function setOptionActive(id, active) {
  const { error } = await sb
    .from("options")
    .update({ active })
    .eq("id", id);

  if (error) {
    alert("Не удалось изменить статус варианта: " + error.message);
    await init();
    return;
  }

  await loadOptions();
  await loadAdmin();
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
    alert("Голоса удалены");
  }
};

async function loadResult() {
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
      ${[0, 1].map(i => `
        <div class="panel">
          <div class="eyebrow">RACE ${i + 1}</div>
          <h2>${escapeHtml(optionLabel(tracks[i] ?? "—"))}</h2>
          <p>Класс: <strong>${escapeHtml(optionLabel(classes[i] ?? classes[0] ?? "—"))}</strong></p>
          <p>Погода: <strong>${escapeHtml(optionLabel(weather[i] ?? weather[0] ?? "—"))}</strong></p>
        </div>
      `).join("")}
    </div>
  `;
}

async function loadVoteStats() {
  if (!currentEvent) return;

  // Загружаем и ники, и сами выборы.
  const { data, error } = await sb
    .from("votes")
    .select("nickname,selections")
    .eq("event_id", currentEvent.id)
    .order("nickname");

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

  // Общая инфографика по категориям.
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

  // Индивидуальные голоса каждого участника.
  const votersHtml = votes.map(vote => {
    const picksHtml = categoryOrder.map(cat => {
      const ids = normalizedVotes(vote.selections, cat);

      if (!ids.length) {
        return `
          <div>
            ${labels[cat]}: <strong>—</strong>
          </div>
        `;
      }

      // Группируем одинаковые варианты, чтобы показывать ×2.
      const grouped = [...new Set(ids)].map(id => {
        const count = ids.filter(x => x === id).length;
        return optionLabel(id) + (count > 1 ? ` ×${count}` : "");
      });

      return `
        <div>
          ${labels[cat]}:
          <strong>${escapeHtml(grouped.join(", "))}</strong>
        </div>
      `;
    }).join("");

    return `
      <div class="voter-card">
        <div class="voter-name">${escapeHtml(vote.nickname || "Без ника")}</div>
        <div class="voter-picks">${picksHtml}</div>
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
      <div class="hint">
        Все голоса участников отображаются открыто.
        Если вариант выбран один раз, он считается за два голоса.
      </div>
      <div class="voter-list">
        ${votersHtml}
      </div>
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
