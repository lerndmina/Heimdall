import { Request, Response } from "express";
import SuggestionModel, { SuggestionStatus } from "../../models/Suggestions";
import { createSuccessResponse, createErrorResponse } from "../utils/apiResponse";

export async function getSuggestions(req: Request, res: Response) {
  try {
    const { guildId } = req.params;
    const suggestions = await SuggestionModel.find({ guildId }).sort({ createdAt: -1 });

    // TODO: Optionally fetch user information from Discord API
    // For now, we'll just return the suggestions without user details

    return res.json(createSuccessResponse(suggestions, req.requestId));
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return res
      .status(500)
      .json(createErrorResponse("Failed to fetch suggestions", 500, req.requestId));
  }
}

export async function getSuggestion(req: Request, res: Response) {
  try {
    const { guildId, suggestionId } = req.params;
    const suggestion = await SuggestionModel.findOne({ guildId, id: suggestionId });

    if (!suggestion) {
      return res.status(404).json(createErrorResponse("Suggestion not found", 404, req.requestId));
    }

    return res.json(createSuccessResponse(suggestion, req.requestId));
  } catch (error) {
    console.error("Error fetching suggestion:", error);
    return res
      .status(500)
      .json(createErrorResponse("Failed to fetch suggestion", 500, req.requestId));
  }
}

export async function updateSuggestion(req: Request, res: Response) {
  try {
    const { guildId, suggestionId } = req.params;
    const { status } = req.body;

    if (!status || !Object.values(SuggestionStatus).includes(status)) {
      return res.status(400).json(createErrorResponse("Invalid status", 400, req.requestId));
    }

    const suggestion = await SuggestionModel.findOneAndUpdate(
      { guildId, id: suggestionId },
      { status },
      { new: true }
    );

    if (!suggestion) {
      return res.status(404).json(createErrorResponse("Suggestion not found", 404, req.requestId));
    }

    return res.json(createSuccessResponse(suggestion, req.requestId));
  } catch (error) {
    console.error("Error updating suggestion:", error);
    return res
      .status(500)
      .json(createErrorResponse("Failed to update suggestion", 500, req.requestId));
  }
}

export async function deleteSuggestion(req: Request, res: Response) {
  try {
    const { guildId, suggestionId } = req.params;
    const result = await SuggestionModel.deleteOne({ guildId, id: suggestionId });

    if (result.deletedCount === 0) {
      return res.status(404).json(createErrorResponse("Suggestion not found", 404, req.requestId));
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Error deleting suggestion:", error);
    return res
      .status(500)
      .json(createErrorResponse("Failed to delete suggestion", 500, req.requestId));
  }
}
