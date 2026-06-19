type EntryAssignmentShape = {
  client_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
};

export const buildProjectClientMap = (projects: Array<{ id: string; client_id?: string | null }>) => {
  const map: Record<string, string | null> = {};
  projects.forEach((project) => {
    map[project.id] = project.client_id ?? null;
  });
  return map;
};

export const resolveEntryClientId = (
  entry: EntryAssignmentShape,
  projectClientMap: Record<string, string | null>
) => entry.client_id ?? (entry.project_id ? projectClientMap[entry.project_id] ?? null : null);

export const enrichEntryAssignment = <T extends EntryAssignmentShape>(
  entry: T,
  clients: Record<string, string>,
  projects: Record<string, string>,
  tasks: Record<string, string>,
  projectClientMap: Record<string, string | null>
) => {
  const clientId = resolveEntryClientId(entry, projectClientMap);

  return {
    ...entry,
    client_id: clientId,
    client_name: clientId ? clients[clientId] : undefined,
    project_name: entry.project_id ? projects[entry.project_id] : undefined,
    task_name: entry.task_id ? tasks[entry.task_id] : undefined,
  };
};