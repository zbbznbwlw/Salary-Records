(() => {
  "use strict";

  const STORAGE_KEY = "wage-calendar.entries.v1";
  const currencyFormatter = new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const monthFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  });
  const weekdayPattern = /^\d{4}-\d{2}-\d{2}$/;

  const elements = {
    calendarGrid: document.querySelector("#calendarGrid"),
    calendarHeading: document.querySelector("#calendarHeading"),
    previousMonth: document.querySelector("#previousMonth"),
    nextMonth: document.querySelector("#nextMonth"),
    goToday: document.querySelector("#goToday"),
    monthTotal: document.querySelector("#monthTotal"),
    monthEntryCount: document.querySelector("#monthEntryCount"),
    saveStatus: document.querySelector("#saveStatus"),
    settlementForm: document.querySelector("#settlementForm"),
    startDate: document.querySelector("#startDate"),
    endDate: document.querySelector("#endDate"),
    settleButton: document.querySelector("#settleButton"),
    clearRange: document.querySelector("#clearRange"),
    rangeError: document.querySelector("#rangeError"),
    settlementResult: document.querySelector("#settlementResult"),
  };

  const today = startOfDay(new Date());
  const state = {
    viewDate: new Date(today.getFullYear(), today.getMonth(), 1),
    entries: loadEntries(),
    activeSettlement: null,
    saveTimer: null,
  };

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function toISODate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function fromISODate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function isISODate(value) {
    if (!weekdayPattern.test(value)) {
      return false;
    }

    const date = fromISODate(value);
    return toISODate(date) === value;
  }

  function parseMoney(value) {
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount) || amount < 0) {
      return 0;
    }
    return Math.round(amount * 100) / 100;
  }

  function formatMoney(value) {
    return currencyFormatter.format(parseMoney(value));
  }

  function loadEntries() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return {};
      }

      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }

      return Object.fromEntries(
        Object.entries(parsed).filter(([date, entry]) => {
          return (
            isISODate(date) &&
            entry &&
            typeof entry === "object" &&
            (typeof entry.wage === "string" || typeof entry.wage === "number") &&
            (typeof entry.note === "string" || entry.note === undefined)
          );
        }),
      );
    } catch {
      return {};
    }
  }

  function setSaveStatus(message, status = "saved") {
    elements.saveStatus.classList.toggle("is-saving", status === "saving");
    elements.saveStatus.classList.toggle("is-error", status === "error");
    elements.saveStatus.lastChild.textContent = ` ${message}`;
  }

  function persistEntries() {
    window.clearTimeout(state.saveTimer);
    setSaveStatus("正在保存…", "saving");

    state.saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
        setSaveStatus("已自动保存");
      } catch {
        setSaveStatus("保存失败，请检查浏览器设置", "error");
      }
    }, 180);
  }

  function entryHasContent(entry) {
    return Boolean(
      entry && (String(entry.wage ?? "") !== "" || String(entry.note ?? "").trim() !== ""),
    );
  }

  function updateMonthSummary() {
    const monthPrefix = `${state.viewDate.getFullYear()}-${pad(
      state.viewDate.getMonth() + 1,
    )}-`;
    let total = 0;
    let entryCount = 0;

    Object.entries(state.entries).forEach(([date, entry]) => {
      if (date.startsWith(monthPrefix) && entryHasContent(entry)) {
        total += parseMoney(entry.wage);
        entryCount += 1;
      }
    });

    elements.monthTotal.textContent = formatMoney(total);
    elements.monthEntryCount.textContent =
      entryCount > 0 ? `本月已记录 ${entryCount} 天` : "还没有记录，今天就开始吧";
  }

  function createBlankCell() {
    const blank = document.createElement("div");
    blank.className = "calendar-blank";
    blank.setAttribute("role", "gridcell");
    blank.setAttribute("aria-hidden", "true");
    return blank;
  }

  function createDayCard(date) {
    const isoDate = toISODate(date);
    const entry = state.entries[isoDate] || { wage: "", note: "" };
    const isToday = isoDate === toISODate(today);
    const dayOfWeek = (date.getDay() + 6) % 7;

    const card = document.createElement("article");
    card.className = "day-card";
    card.dataset.date = isoDate;
    card.setAttribute("role", "gridcell");
    card.setAttribute("aria-label", `${date.getMonth() + 1}月${date.getDate()}日工资记录`);
    card.classList.toggle("weekend", dayOfWeek >= 5);
    card.classList.toggle("is-today", isToday);
    card.classList.toggle("has-entry", entryHasContent(entry));

    const head = document.createElement("div");
    head.className = "day-head";

    const number = document.createElement("span");
    number.className = "day-number";
    number.textContent = pad(date.getDate());
    head.append(number);

    if (isToday) {
      const todayLabel = document.createElement("span");
      todayLabel.className = "today-label";
      todayLabel.textContent = "今天";
      head.append(todayLabel);
    }

    const fields = document.createElement("div");
    fields.className = "entry-fields";

    const wageLabel = document.createElement("label");
    wageLabel.className = "wage-field";
    wageLabel.setAttribute("aria-label", `${date.getDate()}日工资`);

    const currency = document.createElement("span");
    currency.className = "currency";
    currency.textContent = "¥";
    currency.setAttribute("aria-hidden", "true");

    const wageInput = document.createElement("input");
    wageInput.type = "number";
    wageInput.inputMode = "decimal";
    wageInput.min = "0";
    wageInput.step = "0.01";
    wageInput.placeholder = "今日工资";
    wageInput.value = entry.wage ?? "";
    wageInput.dataset.date = isoDate;
    wageInput.dataset.field = "wage";
    wageInput.setAttribute("aria-label", `${date.getMonth() + 1}月${date.getDate()}日工资`);
    wageLabel.append(currency, wageInput);

    const noteLabel = document.createElement("label");
    noteLabel.className = "note-field";

    const noteLabelText = document.createElement("span");
    noteLabelText.className = "sr-only";
    noteLabelText.textContent = "备注";

    const noteInput = document.createElement("textarea");
    noteInput.rows = 2;
    noteInput.maxLength = 160;
    noteInput.placeholder = "添加备注…";
    noteInput.value = entry.note ?? "";
    noteInput.dataset.date = isoDate;
    noteInput.dataset.field = "note";
    noteInput.setAttribute(
      "aria-label",
      `${date.getMonth() + 1}月${date.getDate()}日备注`,
    );
    noteLabel.append(noteLabelText, noteInput);

    fields.append(wageLabel, noteLabel);
    card.append(head, fields);
    return card;
  }

  function renderCalendar() {
    const year = state.viewDate.getFullYear();
    const month = state.viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;

    elements.calendarHeading.textContent = monthFormatter.format(state.viewDate);
    elements.calendarGrid.replaceChildren();
    elements.calendarGrid.setAttribute(
      "aria-label",
      `${monthFormatter.format(state.viewDate)}工资记录日历`,
    );

    for (let index = 0; index < totalCells; index += 1) {
      const dayOfMonth = index - mondayOffset + 1;
      if (dayOfMonth < 1 || dayOfMonth > daysInMonth) {
        elements.calendarGrid.append(createBlankCell());
      } else {
        elements.calendarGrid.append(createDayCard(new Date(year, month, dayOfMonth)));
      }
    }

    updateMonthSummary();
    refreshRangeHighlights();
  }

  function getSelectedRange() {
    const start = elements.startDate.value;
    const end = elements.endDate.value;

    if (!isISODate(start) || !isISODate(end) || start > end) {
      return null;
    }

    return { start, end };
  }

  function refreshRangeHighlights() {
    const range = getSelectedRange();

    elements.calendarGrid.querySelectorAll(".day-card").forEach((card) => {
      const date = card.dataset.date;
      card.classList.toggle("in-range", Boolean(range && date >= range.start && date <= range.end));
      card.classList.toggle("range-start", Boolean(range && date === range.start));
      card.classList.toggle("range-end", Boolean(range && date === range.end));
    });
  }

  function updateDateControls(changedField) {
    const start = elements.startDate.value;
    const end = elements.endDate.value;

    if (isISODate(start) && isISODate(end) && start > end) {
      if (changedField === "start") {
        elements.endDate.value = start;
      } else {
        elements.startDate.value = end;
      }
    }

    const normalizedStart = elements.startDate.value;
    const normalizedEnd = elements.endDate.value;
    elements.endDate.min = isISODate(normalizedStart) ? normalizedStart : "";
    elements.startDate.max = isISODate(normalizedEnd) ? normalizedEnd : "";
    elements.settleButton.disabled = !getSelectedRange();
    elements.rangeError.textContent = "";
    refreshRangeHighlights();
  }

  function clearSettlement() {
    state.activeSettlement = null;
    elements.settlementResult.className = "settlement-result is-empty";
    elements.settlementResult.innerHTML = `
      <div class="result-placeholder">
        <div class="placeholder-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M8 7h8M8 11h8M8 15h5"></path>
            <path d="M6 3h12a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2Z"></path>
          </svg>
        </div>
        <div>
          <h3>等待结算</h3>
          <p>选择开始和结束日期，工资会自动汇总。</p>
        </div>
      </div>
    `;
  }

  function addDays(date, amount) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
  }

  function countDaysInclusive(startISO, endISO) {
    const start = fromISODate(startISO);
    const end = fromISODate(endISO);
    const startUTC = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endUTC = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((endUTC - startUTC) / 86_400_000) + 1;
  }

  function formatResultDate(isoDate) {
    const date = fromISODate(isoDate);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function createResultDetails(recordedDays) {
    const details = document.createElement("details");
    details.className = "result-details";

    const summary = document.createElement("summary");
    const summaryLabel = document.createElement("span");
    summaryLabel.textContent = "查看区间明细";
    summary.append(summaryLabel);

    const summaryCount = document.createElement("span");
    summaryCount.className = "details-count";
    summaryCount.textContent = `${recordedDays.length} 条记录`;
    summary.append(summaryCount);
    details.append(summary);

    if (recordedDays.length === 0) {
      const empty = document.createElement("p");
      empty.className = "no-details";
      empty.textContent = "所选区间内还没有工资或备注记录。";
      details.append(empty);
      return details;
    }

    const list = document.createElement("div");
    list.className = "details-list";

    recordedDays.forEach(({ date, entry }) => {
      const row = document.createElement("div");
      row.className = "detail-row";

      const dateElement = document.createElement("span");
      dateElement.className = "detail-date";
      dateElement.textContent = date;

      const noteElement = document.createElement("span");
      noteElement.className = "detail-note";
      noteElement.textContent = String(entry.note ?? "").trim() || "无备注";

      const amountElement = document.createElement("span");
      amountElement.className = "detail-amount";
      amountElement.textContent =
        String(entry.wage ?? "") === "" ? "未填写工资" : formatMoney(entry.wage);

      row.append(dateElement, noteElement, amountElement);
      list.append(row);
    });

    details.append(list);
    return details;
  }

  function renderSettlement(range) {
    const totalDays = countDaysInclusive(range.start, range.end);
    const recordedDays = [];
    let totalWage = 0;
    let cursor = fromISODate(range.start);

    for (let index = 0; index < totalDays; index += 1) {
      const isoDate = toISODate(cursor);
      const entry = state.entries[isoDate];
      if (entryHasContent(entry)) {
        recordedDays.push({
          date: `${cursor.getMonth() + 1}月${cursor.getDate()}日`,
          entry,
        });
        totalWage += parseMoney(entry.wage);
      }
      cursor = addDays(cursor, 1);
    }

    totalWage = Math.round(totalWage * 100) / 100;
    const averageWage = Math.round((totalWage / totalDays) * 100) / 100;
    state.activeSettlement = range;

    elements.settlementResult.className = "settlement-result";
    elements.settlementResult.replaceChildren();

    const head = document.createElement("div");
    head.className = "result-head";
    head.innerHTML = `
      <span class="result-status">
        <span aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m7 12 3 3 7-7"></path></svg>
        </span>
        已完成结算
      </span>
      <span class="inclusive-badge">起止日均已计入</span>
    `;

    const main = document.createElement("div");
    main.className = "result-main";

    const totalBlock = document.createElement("div");
    const rangeText = document.createElement("p");
    rangeText.className = "result-range";
    rangeText.textContent = `${formatResultDate(range.start)} — ${formatResultDate(range.end)}`;
    const totalElement = document.createElement("strong");
    totalElement.textContent = formatMoney(totalWage);
    totalElement.setAttribute("aria-label", `总工资 ${formatMoney(totalWage)}`);
    totalBlock.append(rangeText, totalElement);

    const stats = document.createElement("div");
    stats.className = "result-stats";
    stats.innerHTML = `
      <div class="result-stat">
        <span>结算天数</span>
        <b>${totalDays} 天</b>
      </div>
      <div class="result-stat">
        <span>有记录</span>
        <b>${recordedDays.length} 天</b>
      </div>
      <div class="result-stat">
        <span>日均工资</span>
        <b>${formatMoney(averageWage)}</b>
      </div>
    `;

    main.append(totalBlock, stats);
    elements.settlementResult.append(
      head,
      main,
      createResultDetails(recordedDays),
    );
  }

  function handleEntryInput(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
      return;
    }

    const date = input.dataset.date;
    const field = input.dataset.field;
    if (!date || !field) {
      return;
    }

    const current = state.entries[date] || { wage: "", note: "" };
    current[field] = input.value;

    if (entryHasContent(current)) {
      state.entries[date] = current;
    } else {
      delete state.entries[date];
    }

    const card = input.closest(".day-card");
    card?.classList.toggle("has-entry", Boolean(state.entries[date]));
    updateMonthSummary();
    persistEntries();

    if (state.activeSettlement) {
      renderSettlement(state.activeSettlement);
    }
  }

  function changeMonth(offset) {
    state.viewDate = new Date(
      state.viewDate.getFullYear(),
      state.viewDate.getMonth() + offset,
      1,
    );
    renderCalendar();
  }

  elements.previousMonth.addEventListener("click", () => changeMonth(-1));
  elements.nextMonth.addEventListener("click", () => changeMonth(1));
  elements.goToday.addEventListener("click", () => {
    state.viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
    renderCalendar();
  });

  elements.calendarGrid.addEventListener("input", handleEntryInput);
  elements.calendarGrid.addEventListener(
    "wheel",
    (event) => {
      if (event.target.matches('input[type="number"]')) {
        event.target.blur();
      }
    },
    { passive: true },
  );

  elements.startDate.addEventListener("change", () => {
    updateDateControls("start");
    clearSettlement();
  });

  elements.endDate.addEventListener("change", () => {
    updateDateControls("end");
    clearSettlement();
  });

  elements.clearRange.addEventListener("click", () => {
    elements.startDate.value = "";
    elements.endDate.value = "";
    elements.startDate.max = "";
    elements.endDate.min = "";
    elements.settleButton.disabled = true;
    elements.rangeError.textContent = "";
    refreshRangeHighlights();
    clearSettlement();
    elements.startDate.focus();
  });

  elements.settlementForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const range = getSelectedRange();
    if (!range) {
      elements.rangeError.textContent = "请选择有效的开始日期和结束日期。";
      return;
    }

    elements.rangeError.textContent = "";
    renderSettlement(range);
  });

  renderCalendar();
})();
