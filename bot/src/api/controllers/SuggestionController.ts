import { Request, Response } from "express";
import SuggestionModel, { SuggestionStatus } from "../../models/Suggestions";

export async function getSuggestions(req: Request, res: Response) {
  const { guildId } = req.params;
  const suggestions = await SuggestionModel.find({ guildId });
  res.json(suggestions);
}

export async function getSuggestion(req: Request, res: Response) {
  const { guildId, suggestionId } = req.params;
  const suggestion = await SuggestionModel.findOne({ guildId, id: suggestionId });
  if (!suggestion) {
    return res.status(404).json({ message: "Suggestion not found" });
  }
  res.json(suggestion);
}

export async function updateSuggestion(req: Request, res: Response) {
  const { guildId, suggestionId } = req.params;
  const { status } = req.body;

  if (!status || !Object.values(SuggestionStatus).includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const suggestion = await SuggestionModel.findOneAndUpdate(
    { guildId, id: suggestionId },
    { status },
    { new: true }
  );

  if (!suggestion) {
    return res.status(404).json({ message: "Suggestion not found" });
  }

  res.json(suggestion);
}

export async function deleteSuggestion(req: Request, res: Response) {
  const { guildId, suggestionId } = req.params;
  const result = await SuggestionModel.deleteOne({ guildId, id: suggestionId });
  if (result.deletedCount === 0) {
    return res.status(404).json({ message: "Suggestion not found" });
  }
  res.status(204).send();
}
