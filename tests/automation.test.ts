import assert from "node:assert/strict";
import { test } from "node:test";
import {
  saveCategoryRule,
  deleteCategoryRule,
  moveCategoryRule,
  saveTransactionTemplate,
  deleteTransactionTemplate,
  saveCsvProfile,
} from "../src/domain/actions/automation";
import {
  applyCsvProfile,
  matchCategoryRule,
  templateDraft,
  validateAutomation,
  type CsvSourceProfile,
  type TransactionTemplate,
} from "../src/domain/automation";
import { decodeBackup, encodeBackup } from "../src/domain/backup";
import {
  applyCsvImport,
  guessCsvMapping,
  parseCsv,
  previewCsv,
} from "../src/domain/csv";
import { createInitialState } from "../src/domain/seed";

const TODAY = "2026-09-10";
const initial = () => createInitialState(false, TODAY);
const ruleInput = {
  pattern: "Кофе",
  match: "contains" as const,
  category: "cafe",
  enabled: true,
};
const templateInput = {
  name: "Кофе",
  title: "Кофе навынос",
  type: "expense" as const,
  amount: 32000,
  category: "cafe",
  accountId: "card",
  currency: "RUB" as const,
};
const table = () =>
  parseCsv("Дата;Описание;Сумма;ID\n10.09.2026;Кофе;-320;bank-1");
function profileInput() {
  return {
    name: "Мой банк",
    currency: "RUB" as const,
    encoding: "utf8" as const,
    separator: ";" as const,
    headerRow: 1,
    headers: table().headers,
    options: {
      accountId: "card",
      mapping: guessCsvMapping(table().headers),
      mode: "signed" as const,
      positive: "income" as const,
      dateOrder: "dmy" as const,
    },
  };
}

test("category rules are explicit, ordered, normalized and ignore archived destinations", () => {
  const original = initial();
  const state = saveCategoryRule(original, ruleInput);
  const next = saveCategoryRule(state, {
    ...ruleInput,
    pattern: "Кофе с собой",
    match: "exact",
    category: "groceries",
  });
  assert.equal(original.categoryRules, undefined);
  assert.equal(matchCategoryRule(next, " КОФЕ   с собой ")?.category, "cafe");
  const reordered = moveCategoryRule(next, next.categoryRules![1].id, -1);
  assert.equal(
    matchCategoryRule(reordered, "кофе с собой")?.category,
    "groceries",
  );
  assert.equal(matchCategoryRule(reordered, "чай"), undefined);
  const archived = {
    ...reordered,
    categories: reordered.categories.map((c) => ({
      ...c,
      archived: c.id === "groceries",
    })),
  };
  assert.equal(matchCategoryRule(archived, "кофе с собой")?.category, "cafe");
  const disabled = saveCategoryRule(reordered, {
    ...reordered.categoryRules![0],
    enabled: false,
  });
  assert.equal(matchCategoryRule(disabled, "кофе с собой")?.category, "cafe");
  assert.equal(
    deleteCategoryRule(disabled, disabled.categoryRules![1].id).categoryRules
      ?.length,
    1,
  );
  assert.throws(
    () => saveCategoryRule(state, { ...ruleInput, pattern: " КОФЕ " }),
    /уже существует/,
  );
  assert.throws(
    () => saveCategoryRule(state, { ...ruleInput, pattern: "   " }),
    /условие/,
  );
  assert.throws(
    () =>
      saveCategoryRule(state, {
        ...ruleInput,
        pattern: "Чай",
        category: "deleted",
      }),
    /активную категорию/,
  );
  assert.throws(() => moveCategoryRule(state, "missing", -1), /удалено/);
  const corrected = saveCategoryRule(next, {
    ...next.categoryRules![1],
    first: true,
  });
  assert.equal(
    matchCategoryRule(corrected, "Кофе с собой")?.category,
    "groceries",
  );
  assert.deepEqual(state.transactions, original.transactions);
});

test("CSV rules explain categorization without changing overrides or deduplication", () => {
  const state = saveCategoryRule(initial(), {
    ...ruleInput,
    category: "groceries",
  });
  const options = profileInput().options;
  const preview = previewCsv(state, table(), options, {}, TODAY);
  assert.equal(preview[0].transaction?.category, "groceries");
  assert.match(preview[0].categoryReason!, /Кофе/);
  const manual = previewCsv(
    state,
    table(),
    options,
    { 2: { category: "transport" } },
    TODAY,
  );
  assert.equal(manual[0].transaction?.category, "transport");
  assert.equal(manual[0].categoryReason, undefined);
  const imported = applyCsvImport(
    state,
    table(),
    options,
    new Set(),
    {},
    TODAY,
  );
  const changed = saveCategoryRule(imported, {
    ...state.categoryRules![0],
    category: "home",
  });
  assert.equal(changed.transactions[0].category, "groceries");
  assert.equal(
    previewCsv(changed, table(), options, {}, TODAY)[0].duplicate,
    true,
  );
  const incomeTable = parseCsv(
    "Дата;Описание;Сумма;ID\n10.09.2026;Кофе;320;bank-2",
  );
  assert.equal(
    previewCsv(state, incomeTable, options, {}, TODAY)[0].categoryReason,
    undefined,
  );
});

test("templates produce new dated drafts without transaction links or balance effects", () => {
  const state = saveTransactionTemplate(initial(), templateInput);
  const template = state.transactionTemplates![0];
  const draft = templateDraft(state, template, TODAY);
  assert.equal(draft.date, TODAY);
  assert.equal(draft.amount, 32000);
  assert.equal(draft.baseAmount, undefined);
  assert.equal(draft.plannedIncomeId, undefined);
  assert.equal(draft.recurringId, undefined);
  assert.equal(draft.goalId, undefined);
  assert.equal(draft.importKey, undefined);
  assert.equal(state.transactions.length, 0);
  const renamed = saveTransactionTemplate(state, {
    ...template,
    name: "Утренний кофе",
    amount: 35000,
  });
  assert.equal(renamed.transactionTemplates!.length, 1);
  assert.equal(renamed.transactionTemplates![0].amount, 35000);
  assert.equal(state.transactionTemplates![0].amount, 32000);
  assert.equal(
    deleteTransactionTemplate(state, template.id).transactionTemplates!.length,
    0,
  );
  assert.throws(
    () => saveTransactionTemplate(state, { ...templateInput, name: " кофе " }),
    /различаться/,
  );
  assert.throws(
    () =>
      saveTransactionTemplate(state, {
        ...templateInput,
        name: "A",
        amount: 0,
      }),
    /Проверьте/,
  );
  assert.throws(
    () =>
      templateDraft(
        { ...state, accounts: state.accounts.filter((a) => a.id !== "card") },
        template,
        TODAY,
      ),
    /недоступны/,
  );
  assert.throws(
    () =>
      templateDraft(
        {
          ...state,
          categories: state.categories.map((c) => ({
            ...c,
            archived: c.id === "cafe",
          })),
        },
        template,
        TODAY,
      ),
    /архиве/,
  );
});

test("transfer templates preserve both actual currency amounts and reject inconsistent accounts", () => {
  const state = initial();
  state.accounts.push({ ...state.accounts[0], id: "dollars", currency: "USD" });
  const input: Omit<TransactionTemplate, "id"> = {
    ...templateInput,
    name: "Обмен",
    type: "transfer",
    toAccountId: "dollars",
    toCurrency: "USD",
    toAmount: 350,
  };
  const next = saveTransactionTemplate(state, input);
  const draft = templateDraft(next, next.transactionTemplates![0], TODAY);
  assert.equal(draft.amount, 32000);
  assert.equal(draft.toAmount, 350);
  assert.throws(
    () => saveTransactionTemplate(state, { ...input, toAmount: undefined }),
    /зачисления/,
  );
  assert.throws(
    () => saveTransactionTemplate(state, { ...input, currency: "USD" }),
    /валюта/,
  );
  assert.throws(
    () =>
      saveTransactionTemplate(state, {
        ...input,
        toAccountId: "card",
        toCurrency: "RUB",
      }),
    /Проверьте/,
  );
  assert.throws(
    () => saveTransactionTemplate(state, { ...input, type: "income" }),
    /только для перевода/,
  );
});

test("CSV profiles retain mapping and source settings but require exact headers and matching account currency", () => {
  const original = initial();
  const state = saveCsvProfile(original, profileInput());
  const profile = state.csvProfiles![0];
  const options = applyCsvProfile(state, profile, table().headers);
  options.mapping.date = 2;
  assert.equal(profile.options.mapping.date, 0);
  assert.equal(profile.encoding, "utf8");
  assert.equal(profile.headerRow, 1);
  assert.equal(profile.options.dateOrder, "dmy");
  assert.equal(original.csvProfiles, undefined);
  assert.throws(
    () => applyCsvProfile(state, profile, ["Описание", "Дата", "Сумма", "ID"]),
    /отличаются/,
  );
  const missing = {
    ...state,
    accounts: state.accounts.filter((a) => a.id !== "card"),
  };
  assert.throws(
    () => applyCsvProfile(missing, profile, table().headers),
    /недоступны/,
  );
  const different = { ...profile, currency: "USD" as const };
  assert.throws(
    () => applyCsvProfile(state, different, table().headers),
    /валюта/,
  );
  assert.throws(
    () => saveCsvProfile(state, { ...profileInput(), name: "мой банк" }),
    /различаться/,
  );
  assert.throws(
    () =>
      saveCsvProfile(state, {
        ...profileInput(),
        name: "Bad",
        options: {
          ...profile.options,
          mapping: { ...profile.options.mapping, title: 0 },
        },
      }),
    /отдельная колонка/,
  );
  const second = saveCsvProfile(state, {
    ...profileInput(),
    name: "Другой источник с такими же колонками",
  });
  assert.equal(second.csvProfiles!.length, 2); // No automatic selection by shared headers.
});

test("backup roundtrip includes automation, preserves old absent fields and rejects broken references", () => {
  const old = initial();
  assert.equal(decodeBackup(encodeBackup(old)).categoryRules, undefined);
  let state = saveCategoryRule(old, ruleInput);
  state = saveTransactionTemplate(state, templateInput);
  state = saveCsvProfile(state, profileInput());
  const restored = decodeBackup(encodeBackup(state));
  assert.deepEqual(restored.categoryRules, state.categoryRules);
  assert.deepEqual(restored.transactionTemplates, state.transactionTemplates);
  assert.deepEqual(restored.csvProfiles, state.csvProfiles);
  const invalid = {
    ...state,
    categoryRules: [{ ...state.categoryRules![0], category: "removed" }],
  };
  assert.throws(
    () => decodeBackup(encodeBackup(invalid)),
    /неизвестную категорию/,
  );
  assert.throws(
    () =>
      validateAutomation({
        ...state,
        csvProfiles: [
          { ...state.csvProfiles![0], id: "id" },
          { ...state.csvProfiles![0], id: "id" },
        ],
      }),
    /идентификаторы/,
  );
  const inconsistent = {
    ...state.csvProfiles![0],
    options: {
      ...state.csvProfiles![0].options,
      mapping: {
        ...state.csvProfiles![0].options.mapping,
        expense: 3,
        bankId: -1,
      },
    },
  } as CsvSourceProfile;
  assert.throws(
    () => validateAutomation({ ...state, csvProfiles: [inconsistent] }),
    /неиспользуемые/,
  );
});
