import { permissionCategories, type PermissionCategory } from "./dashboardPermissionDefs.js";
import { createLogger } from "./Logger.js";

export interface PermissionActionDefinition {
  key: string;
  label: string;
  description: string;
  defaultAllow?: boolean;
}

export interface DynamicPermissionCategory {
  categoryKey: string;
  actions: PermissionActionDefinition[];
}

export type DynamicPermissionProvider = (guildId: string) => Promise<DynamicPermissionCategory[]>;

const log = createLogger("permissions:registry");

function cloneCategories(categories: PermissionCategory[]): PermissionCategory[] {
  return categories.map((cat) => ({
    key: cat.key,
    label: cat.label,
    description: cat.description,
    actions: cat.actions.map((action) => ({
      key: action.key,
      label: action.label,
      description: action.description,
    })),
  }));
}

export class PermissionRegistry {
  private baseCategories: PermissionCategory[];
  private registeredActions: Map<string, Map<string, PermissionActionDefinition>> = new Map();
  private dynamicProviders: Map<string, DynamicPermissionProvider> = new Map();

  constructor(baseCategories: PermissionCategory[]) {
    this.baseCategories = cloneCategories(baseCategories);

    for (const cat of baseCategories) {
      const actionMap = new Map<string, PermissionActionDefinition>();
      for (const action of cat.actions) {
        actionMap.set(action.key, { key: action.key, label: action.label, description: action.description, defaultAllow: action.defaultAllow });
      }
      this.registeredActions.set(cat.key, actionMap);
    }
  }

  registerAction(categoryKey: string, action: PermissionActionDefinition): void {
    if (!categoryKey || !action.key) return;

    if (!this.registeredActions.has(categoryKey)) {
      this.registeredActions.set(categoryKey, new Map());
      log.warn(`Registering action for unknown category "${categoryKey}"`);
    }

    const actionMap = this.registeredActions.get(categoryKey)!;
    actionMap.set(action.key, { ...action });
  }

  unregisterAction(categoryKey: string, actionKey: string): void {
    const actionMap = this.registeredActions.get(categoryKey);
    if (!actionMap) return;
    actionMap.delete(actionKey);
  }

  registerDynamicProvider(id: string, provider: DynamicPermissionProvider): void {
    this.dynamicProviders.set(id, provider);
  }

  async getCategories(guildId?: string): Promise<PermissionCategory[]> {
    const categories = cloneCategories(this.baseCategories);
    const categoryMap = new Map<string, PermissionCategory>(categories.map((cat) => [cat.key, cat]));

    for (const [categoryKey, actionMap] of this.registeredActions.entries()) {
      let category = categoryMap.get(categoryKey);
      if (!category) {
        category = {
          key: categoryKey,
          label: categoryKey,
          description: "",
          actions: [],
        };
        categoryMap.set(categoryKey, category);
        categories.push(category);
      }

      for (const action of actionMap.values()) {
        if (!category.actions.some((existing) => existing.key === action.key)) {
          category.actions.push({ ...action });
        }
      }
    }

    if (guildId && this.dynamicProviders.size > 0) {
      for (const provider of this.dynamicProviders.values()) {
        try {
          const dynamicCategories = await provider(guildId);
          for (const dynamic of dynamicCategories) {
            let category = categoryMap.get(dynamic.categoryKey);
            if (!category) {
              category = {
                key: dynamic.categoryKey,
                label: dynamic.categoryKey,
                description: "",
                actions: [],
              };
              categoryMap.set(dynamic.categoryKey, category);
              categories.push(category);
            }

            for (const action of dynamic.actions) {
              if (!category.actions.some((existing) => existing.key === action.key)) {
                category.actions.push({ ...action });
              }
            }
          }
        } catch (error) {
          log.warn("Dynamic permission provider failed:", error);
        }
      }
    }

    return categories;
  }

  async getAllActionKeys(guildId?: string): Promise<Set<string>> {
    const categories = await this.getCategories(guildId);
    const keys = new Set<string>();
    for (const cat of categories) {
      for (const action of cat.actions) {
        keys.add(`${cat.key}.${action.key}`);
      }
    }
    return keys;
  }
}

export const permissionRegistry = new PermissionRegistry(permissionCategories);
