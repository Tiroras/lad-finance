import { View } from "react-native";
import { currencySymbol } from "../../../domain/currency";
import { useFinance } from "../../../state/finance";
import { AmountField, Button, Notice, Txt } from "../../../shared/ui";
import { AccountPicker } from "../../accounts";
import { CategoryPicker } from "../../categories";
import {
  draftAccountCurrency,
  type TransactionDraft,
} from "../model/transactionDraft";

export function ExchangeFeeFields({
  draft,
  onChange,
}: {
  draft: TransactionDraft;
  onChange: (values: Partial<TransactionDraft>) => void;
}) {
  const { state } = useFinance();
  const currency = draftAccountCurrency(
    state,
    draft.feeAccountId ?? draft.accountId,
  );
  return (
    <View testID="exchange-fee" style={{ gap: 14 }}>
      <Button
        label={
          draft.feeEnabled
            ? "Убрать комиссию обмена"
            : "Добавить комиссию обмена"
        }
        variant="secondary"
        onPress={() =>
          onChange({
            feeEnabled: !draft.feeEnabled,
            feeAccountId:
              draft.feeAccountId ??
              (state.accounts.find((a) => a.id === draft.accountId)?.kind !==
              "savings"
                ? draft.accountId
                : state.accounts.find(
                    (a) => !a.archived && a.kind === "spending",
                  )?.id),
            feeCategory: draft.feeCategory ?? "other",
          })
        }
      />
      {draft.feeEnabled && (
        <>
          <Notice>
            Сумма перевода не включает комиссию. Будут записаны сразу два
            движения: обмен с фактическими суммами и отдельный расход комиссии.
            При ошибке ни одна запись не добавится.
          </Notice>
          <AmountField
            label={`Комиссия, ${currencySymbol(currency)}`}
            accessibilityLabel="Комиссия обмена"
            value={draft.feeAmount ?? ""}
            onChangeText={(feeAmount) => onChange({ feeAmount })}
          />
          <AccountPicker
            label="Счёт комиссии"
            selected={draft.feeAccountId ?? ""}
            spendingOnly
            includeCredit
            onChange={(feeAccountId) =>
              onChange({ feeAccountId, feeAmount: "" })
            }
          />
          <Txt>Категория комиссии</Txt>
          <CategoryPicker
            value={draft.feeCategory ?? "other"}
            variant="select"
            onChange={(feeCategory) => onChange({ feeCategory })}
          />
          <Notice>
            После сохранения перевод и комиссия доступны в истории как отдельные
            операции. Комиссия входит в расходы, обмен — нет.
          </Notice>
        </>
      )}
    </View>
  );
}
