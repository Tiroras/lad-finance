import { useState } from "react";
import { View } from "react-native";
import type { SavedScenario } from "../../../domain/types";
import {
  DeleteButton,
  ErrorText,
  Button,
  Field,
  Notice,
  Segments,
} from "../../../shared/ui";
import { useActionError } from "../../../shared/lib/useActionError";
import { useFinanceActions, useFinance } from "../../../state/finance";
import { ForecastRange } from "../../forecast";
import { ScenarioChanges } from "./ScenarioChanges";
import { ScenarioComparison } from "./ScenarioComparison";
import { ScenarioEvents } from "./ScenarioEvents";
import { parseScenarioDraft, scenarioDraft } from "../model/scenarioDraft";

export function ScenarioForm({
  id,
  close,
}: {
  id?: string;
  close: () => void;
}) {
  const { state, notify } = useFinance();
  const actions = useFinanceActions();
  const { error, run } = useActionError();
  const [draft, setDraft] = useState(() =>
    scenarioDraft(
      state.scenarios?.find((s) => s.id === id),
      state,
    ),
  );
  const [tab, setTab] = useState("conditions");
  let scenario: SavedScenario | undefined,
    validation = "";
  try {
    scenario = parseScenarioDraft(draft, id, state);
  } catch (e) {
    validation = (e as Error).message;
  }
  return (
    <View style={{ gap: 20 }}>
      <Notice>
        Проверьте «что, если…» и сохраните вариант, чтобы вернуться к нему
        позже. Ни одно изменение здесь не создаёт реальных операций.
      </Notice>
      <Field
        label="Название сценария"
        accessibilityLabel="Название сценария"
        value={draft.name}
        maxLength={120}
        onChangeText={(name) => setDraft({ ...draft, name })}
      />
      <ForecastRange
        value={draft.horizon}
        onChange={(horizon) => setDraft({ ...draft, horizon })}
      />
      <Segments
        value={tab}
        onChange={setTab}
        options={[
          { value: "conditions", label: "Условия" },
          { value: "comparison", label: "Сравнение" },
        ]}
      />
      {tab === "conditions" ? (
        <>
          <ScenarioChanges draft={draft} onChange={setDraft} />
          <ScenarioEvents draft={draft} onChange={setDraft} />
          <Button
            label="Сравнить с планом"
            variant="secondary"
            onPress={() => setTab("comparison")}
          />
        </>
      ) : (
        scenario && <ScenarioComparison scenario={scenario} />
      )}
      <ErrorText error={error || validation} />
      <Button
        label="Сохранить сценарий"
        disabled={!scenario}
        onPress={() =>
          run(() => {
            actions.saveScenario({
              ...parseScenarioDraft(draft, id, state),
              id,
            });
            notify("Сценарий сохранён, основной план не изменён");
            close();
          })
        }
      />
      {id && (
        <DeleteButton
          label="Удалить сценарий"
          explanation="Сохранённый вариант будет удалён. Операции, счета и основной план сохранятся."
          onDelete={() =>
            run(() => {
              actions.deleteScenario(id);
              notify("Сценарий удалён");
              close();
            })
          }
        />
      )}
    </View>
  );
}
