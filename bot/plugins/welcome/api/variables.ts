/**
 * GET /api/guilds/:guildId/welcome/variables
 *
 * Returns available template variables for welcome messages.
 *
 * @swagger
 * /api/guilds/{guildId}/welcome/variables:
 *   get:
 *     summary: Get welcome message template variables
 *     description: Returns the list of available placeholder variables
 *     tags: [Welcome]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Available template variables
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { WelcomeApiDependencies } from "./index.js";

export function createVariablesRoutes(deps: WelcomeApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const docs = deps.welcomeService.getTemplateDocumentation();

      const variables = Object.entries(docs).map(([variable, description]) => ({
        variable,
        description,
        example: getExampleForVariable(variable),
      }));

      res.json({
        success: true,
        data: { variables },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function getExampleForVariable(variable: string): string {
  const examples: Record<string, string> = {
    "{username}": "john_doe",
    "{displayname}": "John Doe",
    "{mention}": "@john_doe",
    "{id}": "123456789012345678",
    "{guild}": "My Server",
    "{membercount}": "150",
    "{newline}": "\\n",
  };
  return examples[variable] ?? "";
}
