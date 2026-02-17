export interface ProjectItem {
  id: string;
  name: string;
  summary: string;
  status: "active" | "planning" | "paused";
  updatedAt: number;
}

const KEY = "neuroedge_projects_v1";
const now = () => Date.now();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const seedProjects = (): ProjectItem[] => [
  {
    id: uid(),
    name: "NeuroEdge Core",
    summary: "Inference, orchestration, and governance stack.",
    status: "active",
    updatedAt: now(),
  },
  {
    id: uid(),
    name: "Mesh Runtime",
    summary: "Distributed edge-node inference rollout.",
    status: "planning",
    updatedAt: now() - 1000 * 60 * 60 * 3,
  },
];

const read = (): ProjectItem[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedProjects();
    const parsed = JSON.parse(raw) as ProjectItem[];
    if (!Array.isArray(parsed)) return seedProjects();
    return parsed;
  } catch {
    return seedProjects();
  }
};

const write = (items: ProjectItem[]) => {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("neuroedge:projectsUpdated"));
};

export const listProjects = (): ProjectItem[] => {
  const items = read();
  if (!localStorage.getItem(KEY)) write(items);
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
};

export const createProject = (name: string, summary: string) => {
  const cleanName = name.trim();
  if (!cleanName) return;
  const next: ProjectItem[] = [
    {
      id: uid(),
      name: cleanName,
      summary: summary.trim() || "No summary yet.",
      status: "planning",
      updatedAt: now(),
    },
    ...read(),
  ];
  write(next);
};

export const updateProject = (
  id: string,
  patch: Partial<Pick<ProjectItem, "name" | "summary" | "status">>
) => {
  const next = read().map((p) =>
    p.id === id
      ? {
          ...p,
          ...patch,
          name: patch.name?.trim() || p.name,
          summary: patch.summary?.trim() || p.summary,
          updatedAt: now(),
        }
      : p
  );
  write(next);
};

export const deleteProject = (id: string) => {
  write(read().filter((p) => p.id !== id));
};
