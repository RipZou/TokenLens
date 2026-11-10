export function applyLiveCall<T extends { id: string }>(calls: T[], incoming: T): T[] {
  if (calls.some((call) => call.id === incoming.id)) return calls;
  return [incoming, ...calls];
}

export function connectionLabel(state: "open" | "error" | "connecting"): "Live" | "Reconnecting" {
  return state === "open" ? "Live" : "Reconnecting";
}
