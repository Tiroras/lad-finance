import { useState } from "react";

export function useActionError() {
  const [error, setError] = useState("");
  const run = (action: () => void) => {
    setError("");
    try {
      action();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось сохранить изменения.",
      );
    }
  };
  return { error, setError, run };
}
