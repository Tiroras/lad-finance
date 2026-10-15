import { createInitialState } from "../../src/domain/seed";
import { encodeBackup, validateBackupValue } from "../../src/domain/backup";
import { createPlainLedgerStorage } from "../../src/infrastructure/storage/plainLedgerStorage";
import { confirmFinanceSnapshot } from "../../src/state/finance/confirmedSave";
import { createDraftLifecycle } from "../../src/state/finance/draftLifecycle";
import { createDraftStore } from "../../src/infrastructure/storage/draftStore";

const today = "2026-10-15";
function check(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
function harness() {
  const expected = validateBackupValue(createInitialState(false, today), today);
  expected.accounts[0].openingBalance = 32100;
  let raw = encodeBackup(createInitialState(false, today));
  let writes = 0;
  let fail: "none" | "before" | "after" = "none";
  const ledger = createPlainLedgerStorage(
    {
      async getItem() {
        return raw;
      },
      async setItem(_key, value) {
        writes++;
        if (fail === "before") throw new Error("synthetic before write");
        raw = value;
        if (fail === "after") throw new Error("synthetic after write");
      },
    },
    "personal",
  );
  return {
    expected,
    get writes() {
      return writes;
    },
    fail(value: typeof fail) {
      fail = value;
    },
    commit() {
      raw = encodeBackup(expected);
    },
    confirm() {
      return confirmFinanceSnapshot({
        state: expected,
        today,
        save: () => ledger.save(expected),
        inspect: () => ledger.inspect({ normalizationDate: today }),
      });
    },
  };
}
export const t04SaveCases = [
  {
    name: "replacement restart across a month keeps the original normalization context",
    async run() {
      const date = "2026-10-31";
      const legacy = createInitialState(false, date);
      const recurring = { ...createInitialState(true, date).recurring[0] };
      delete recurring.startsOn;
      legacy.recurring = [recurring];
      let raw = encodeBackup(legacy);
      const ledger = createPlainLedgerStorage({
        async getItem() {
          return raw;
        },
        async setItem(_key, value) {
          raw = value;
        },
      });
      const data = new Map<string, string>();
      const drafts = createDraftStore({
        profile: "personal",
        random: (length) => crypto.getRandomValues(new Uint8Array(length)),
        storage: {
          async getItem(key) {
            return data.get(key) ?? null;
          },
          async setItem(key, value) {
            data.set(key, value);
          },
          async removeItem(key) {
            data.delete(key);
          },
        },
      });
      const initial = await drafts.load("transaction");
      const lease = await drafts.claim(
        { slot: "transaction", recordId: "new" },
        initial,
      );
      await drafts.save(lease, { amount: "12," });
      const lifecycle = createDraftLifecycle({
        drafts: () => drafts,
        inspect: (_profile, normalizationDate) =>
          ledger.inspect({ normalizationDate }),
      });
      const next = createInitialState(false, date);
      await lifecycle.prepareReplacement({
        profileId: "personal",
        operationId: "month-end",
        next,
        validationDate: date,
      });
      const nextMonth = await ledger.inspect({
        normalizationDate: "2026-11-01",
      });
      check(nextMonth.status === "readable", "legacy fixture unreadable");
      if (nextMonth.status !== "readable") return;
      check(
        nextMonth.state.recurring[0].startsOn === "2026-11-01",
        "fixture did not cross normalization month",
      );
      check(
        (await lifecycle.settleReplacement("personal", nextMonth.state)) ===
          "cancelled",
        "unchanged source stayed blocked after a month boundary",
      );
      check(
        (await drafts.load("transaction")).draft?.payload.amount === "12,",
        "original fields lost",
      );
      await lifecycle.prepareReplacement({
        profileId: "personal",
        operationId: "committed-month-end",
        next,
        validationDate: date,
      });
      raw = encodeBackup(next);
      check(
        (await lifecycle.settleReplacement("personal", next)) === "committed",
        "exact replacement was not recognized",
      );
      check(
        (await drafts.load("transaction")).draft === null,
        "old fields survived committed replacement",
      );
    },
  },
  {
    name: "successful save requires exact read-back",
    async run() {
      const h = harness();
      await h.confirm();
      check(h.writes === 1, "one write expected");
    },
  },
  {
    name: "an already committed retry does not rewrite",
    async run() {
      const h = harness();
      h.commit();
      await h.confirm();
      check(h.writes === 0, "unnecessary rewrite");
    },
  },
  {
    name: "rejection after commit is proven by read-back",
    async run() {
      const h = harness();
      h.fail("after");
      await h.confirm();
      check(h.writes === 1, "wrong write count");
    },
  },
  {
    name: "rejection before commit retains the draft until a retry",
    async run() {
      const h = harness();
      h.fail("before");
      let rejected = false;
      try {
        await h.confirm();
      } catch {
        rejected = true;
      }
      check(rejected, "unconfirmed save was accepted");
      h.fail("none");
      await h.confirm();
      check(h.writes === 2, "retry did not save the same snapshot");
    },
  },
];
