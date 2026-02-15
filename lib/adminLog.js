export async function writeAdminLog(admin, me, { action, target = null, payload = null, undo = null }) {
  try {
    const actor_email = me?.profile?.email || me?.user?.email || null;
    await admin.from('admin_audit_log').insert({
      actor_email,
      action,
      target,
      payload,
      undo
    });
  } catch {
    // Best-effort: never fail the main operation because logging failed
  }
}

export function undoRollbackImport(importId) {
  return { type: 'rollback_import', import_id: importId };
}

export function undoToggleAppEnabled(appId, previousEnabled) {
  return { type: 'toggle_app_enabled', app_id: appId, previous_enabled: !!previousEnabled };
}

export function undoRestoreApp(appRow) {
  return { type: 'restore_app', app_row: appRow };
}

export function undoRestoreDatasetSchema(dataset, previousRow) {
  return { type: 'restore_dataset_schema', dataset, previous_row: previousRow || null };
}
