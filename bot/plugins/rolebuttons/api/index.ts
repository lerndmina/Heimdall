import { Router } from "express";
import { createRoleButtonsListRoutes } from "./list.js";
import { createRoleButtonsCreateRoutes } from "./create.js";
import { createRoleButtonsGetRoutes } from "./get.js";
import { createRoleButtonsUpdateRoutes } from "./update.js";
import { createRoleButtonsDeleteRoutes } from "./delete.js";
import { createRoleButtonsPostRoutes } from "./post.js";
import { createRoleButtonsUpdatePostsRoutes } from "./update-posts.js";
import { createRoleButtonsDeletePostRoutes } from "./delete-post.js";
import type { RoleButtonsPluginAPI } from "../index.js";

export type RoleButtonsApiDependencies = Pick<RoleButtonsPluginAPI, "roleButtonService" | "lib" | "client">;

export function createRouter(api: RoleButtonsPluginAPI): Router {
  const deps = { roleButtonService: api.roleButtonService, lib: api.lib, client: api.client };
  const router = Router({ mergeParams: true });

  router.use("/", createRoleButtonsListRoutes(deps));
  router.use("/", createRoleButtonsCreateRoutes(deps));
  router.use("/", createRoleButtonsGetRoutes(deps));
  router.use("/", createRoleButtonsUpdateRoutes(deps));
  router.use("/", createRoleButtonsDeleteRoutes(deps));
  router.use("/", createRoleButtonsPostRoutes(deps));
  router.use("/", createRoleButtonsUpdatePostsRoutes(deps));
  router.use("/", createRoleButtonsDeletePostRoutes(deps));

  return router;
}
