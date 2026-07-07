export function audit(action: string, entity: string, payload?: unknown) {
  // eslint-disable-next-line no-console
  console.info(`[audit ${new Date().toISOString()}] ${action} :: ${entity}`, payload ?? "");
}
