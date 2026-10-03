import { useLayoutEffect, useState } from "react";
import type {
  TextInputChangeEvent,
  TextInputKeyPressEvent,
  TextInputSelectionChangeEvent,
} from "react-native";
import type {
  createFormattedInputController,
  InputSelection,
  SelectionEdit,
} from "../lib/formattedInput";

export function useFormattedInput<Edit extends SelectionEdit>({
  value,
  displayed,
  createController,
  onEdit,
}: {
  value: string;
  displayed: string;
  createController: (
    value: string,
  ) => ReturnType<typeof createFormattedInputController<Edit>>;
  onEdit: (edit: Edit) => void;
}) {
  const [input] = useState(() => createController(value));
  const [selection, setSelection] = useState<InputSelection>();
  useLayoutEffect(() => {
    if (input.sync(value)) setSelection(undefined);
  }, [input, value]);

  return {
    release() {
      input.release();
      setSelection(undefined);
    },
    fieldProps: {
      value: displayed,
      selection,
      onSelectionChange({ nativeEvent }: TextInputSelectionChangeEvent) {
        const event = nativeEvent as typeof nativeEvent & { text?: string };
        setSelection(input.select(event.selection, event.text));
      },
      onKeyPress({ nativeEvent }: TextInputKeyPressEvent) {
        input.keyPress(nativeEvent.key);
      },
      onChange({ nativeEvent }: TextInputChangeEvent) {
        // RN 0.86 pairs selection with text on iOS and Android, but its types
        // still omit selection. Web uses the controller's edit fallback.
        const event = nativeEvent as typeof nativeEvent & {
          selection?: InputSelection;
        };
        const edit = input.change(displayed, event.text, event.selection);
        setSelection(edit.selection);
        onEdit(edit);
      },
    },
  };
}
