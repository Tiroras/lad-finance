// Capture scripts use a fresh browser context and opt into the sample profile
// through the same first-run and profile controls as the app.
export async function openDemoForCapture(page) {
  const button = (name) => page.getByRole("button", { name, exact: true });
  const skip = button("Пропустить знакомство");
  await skip.or(button("Профиль и настройки")).first().waitFor();
  if (await skip.isVisible()) {
    await skip.click();
    await button("Начать с пустым профилем").click();
  }
  await button("Профиль и настройки").waitFor();
  if (await button("Текущий профиль: Демо. Открыть профили").isVisible())
    return;
  await button("Профиль и настройки").click();
  await button("Профили").click();
  const demo = button("Открыть профиль: Демо");
  await demo.waitFor();
  await demo.click();
  await button("Текущий профиль: Демо. Открыть профили").waitFor();
}
