import { createUiServer } from "./ui-server.js";

async function main(): Promise<void> {
  const port = Number(process.env.UI_PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("UI_PORT must be an integer between 1 and 65535.");
  }
  const server = await createUiServer();
  server.on("error", (error) => {
    console.error(
      `UI server: ${error.message}. Set UI_PORT to use another port.`,
    );
    process.exitCode = 2;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`API Replay UI: http://127.0.0.1:${port}`);
    console.log(
      "The built-in example needs no API servers. For live demo requests, run npm run demo in another terminal.",
    );
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      server.close();
      server.closeIdleConnections();
    });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
