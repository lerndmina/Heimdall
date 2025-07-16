"use client";

import { useEffect } from "react";
import { useBotName } from "@/hooks/use-bot-info";

export function DynamicTitle() {
  const botName = useBotName();

  useEffect(() => {
    document.title = `${botName} Dashboard`;
  }, [botName]);

  return null;
}
