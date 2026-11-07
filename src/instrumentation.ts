// Runs once when the server starts. On a fresh installation it prints the
// setup wizard link with its one-time key, like Jenkins or Grafana do.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { announceSetup } = await import("./lib/system/startup");
    await announceSetup();
  } catch (error) {
    console.warn("[tamam] Could not check installation state:", error instanceof Error ? error.message : error);
  }
}
