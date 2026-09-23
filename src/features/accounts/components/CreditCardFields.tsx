import { currencySymbol, type CurrencyCode } from "../../../domain/currency";
import { Notice, AmountField, DateField } from "../../../shared/ui";

export function CreditCardFields({
  currency,
  limit,
  onLimitChange,
  dueDate,
  onDueDateChange,
  dueAmount,
  onDueAmountChange,
}: {
  currency: CurrencyCode;
  limit: string;
  onLimitChange: (value: string) => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  dueAmount: string;
  onDueAmountChange: (value: string) => void;
}) {
  return (
    <>
      <AmountField
        label={`Кредитный лимит, ${currencySymbol(currency)}`}
        accessibilityLabel="Кредитный лимит"
        value={limit}
        onChangeText={onLimitChange}
      />
      <DateField
        label="Срок обязательного платежа"
        accessibilityLabel="Срок платежа по карте"
        value={dueDate}
        onChangeText={onDueDateChange}
        placeholder="Без срока"
        allowClear
      />
      <AmountField
        label={`Осталось внести по выписке, ${currencySymbol(currency)}`}
        accessibilityLabel="Обязательный платёж по карте"
        value={dueAmount}
        onChangeText={onDueAmountChange}
      />
      <Notice>
        Сверьте срок и оставшийся платёж с выпиской банка. После сохранения
        новые переводы на карту уменьшают эту сумму. Лимит не входит в ваши
        деньги для трат; проценты и льготный период автоматически не
        рассчитываются.
      </Notice>
    </>
  );
}
