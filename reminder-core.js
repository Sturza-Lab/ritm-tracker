export function getReminderState({ supported, standalone, permission, optedIn, isIos }) {
  if (!supported) return { code: "unsupported", label: "Недоступно на этом устройстве", action: null };
  if (isIos && !standalone) return { code: "install", label: "Сначала добавьте приложение на экран Домой", action: "Как установить" };
  if (optedIn) return { code: "enabled", label: "Напоминание включено", action: "Отключить" };
  if (permission === "denied") return { code: "denied", label: "Уведомления запрещены в настройках", action: "Открыть настройки" };
  return { code: "available", label: "Каждый вечер напомню заглянуть к себе", action: "Включить" };
}

export function isStandalone(displayMode, navigatorStandalone) {
  return displayMode === "standalone" || navigatorStandalone === true;
}
