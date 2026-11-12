
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

function tab(name) {
  document.querySelectorAll(".tab").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === name)
  );

  ["vote", "result", "admin"].forEach(x =>
    $(x).classList.toggle("hidden", x !== name)
  );
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
    $("connection").textContent =
      "Создай гоночный вечер в SQL / админке";
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

  if (currentUser) {
    await loadAdmin();
  }
}

async function loadOptions() {
  const { data, error } = await sb
    .from("options")
    .select("id,category,label,active")
    .eq("active", true)
    .order("sort_order");

  if (error) {
    showError("Ошибка загрузки вариантов", error);
    return;
  }

  categories = data || [];

  $("vote-categories").innerHTML = categoryOrder
    .map(cat => `
      <div class="panel">
        <h2>${labels[cat]}</h2>
        <div class="hint">Выбери один вариант</div>
        <div class="options">
          ${categories
            .filter(o => o.category === cat)
            .map(o => `
              <label class="option">
                <input type="radio" name="${cat}" value="${o.id}">
                <span>${escapeHtml(o.label)}</span>
              </label>
            `).join("") ||
            '<div class="muted">Пока нет вариантов</div>'}
        </div>
      </div>
    `).join("");
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
    const el = document.querySelector(
      `input[name="${cat}"]:checked`
    );

    if (!el) {
      alert("Выбери вариант во всех категориях");
      return;
    }

    selections[cat] = el.value;
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

  alert("Голос сохранён. Его можно изменить до закрытия голосования.");
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

  $("admin-categories").innerHTML = categoryOrder
    .map(cat => `
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
              <div class="item">
                <span>${escapeHtml(o.label)}</span>
                <button class="btn danger" data-del="${o.id}">
                  Удалить
                </button>
              </div>
            `).join("")}
        </div>
      </div>
    `).join("");

  document.querySelectorAll("[data-add]").forEach(b => {
    b.onclick = () => addOption(b.dataset.add);
  });

  document.querySelectorAll("[data-del]").forEach(b => {
    b.onclick = () => deleteOption(b.dataset.del);
  });

  await loadHistory();
}

async function addOption(cat) {
  const label = $("new-" + cat).value.trim();

  if (!label) return;

  const { error } = await sb
    .from("options")
    .insert({ category: cat, label });

  if (error) {
    alert(error.message);
    return;
  }

  await init();
  await loadAdmin();
}

async function deleteOption(id) {
  if (!confirm("Удалить вариант?")) return;

  const { error } = await sb
    .from("options")
    .update({ active: false })
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  await init();
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
  if (!confirm("Закрыть голосование и провести weighted-жеребьёвку?")) {
    return;
  }

  const { data, error } = await sb.rpc("draw_weighted", {
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

  $("result-card").innerHTML = `
    <div class="eyebrow">RACE SELECTED</div>
    <h2>${escapeHtml(r.track)}</h2>
    <p>Класс: <strong>${escapeHtml(r.car_class)}</strong></p>
    <p>Погода: <strong>${escapeHtml(r.weather)}</strong></p>
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

  $("history").innerHTML = (data || [])
    .map(e => `
      <div class="item">
        <span>
          ${escapeHtml(e.title)} ·
          ${e.result
            ? escapeHtml(e.result.track)
            : "Без результата"}
        </span>
        <small class="muted">
          ${new Date(e.created_at).toLocaleDateString("ru-RU")}
        </small>
      </div>
    `).join("") ||
    '<div class="muted">История пока пуста</div>';
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
