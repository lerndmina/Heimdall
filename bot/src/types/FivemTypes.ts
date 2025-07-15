export interface FivemReportMessageArgs {
  id: string;
  action: FivemReportMessageActions;
  context: string;
}

export enum FivemReportMessageActions {
  NewReport = "NewReport",
  NewMessage = "NewMessage",
  Solved = "Solved",
  Claimed = "Claimed",
  Deleted = "Deleted",
  UserAdded = "UserAdded",
}

export interface FivemReport {
  ticketID: string;
  claimedAdmin: string[];
  description: string;
  messages: {
    message: string;
    date: string;
    name: string;
    media: {
      fileURL?: string;
      fileDate?: string;
      fileName?: string;
      select?: boolean;
      id?: string;
    }[];
    identifier: string;
    avatar: string;
  }[];
  date: string;
  ticketOwnerDetails: {
    ip: string;
    name: string;
    discordName: string;
    licenseID: string;
    avatar: string;
    xbl: string;
    identifier: string;
    ping: number;
    id: number;
    live: string;
    discordID: string;
  };
  priority: {
    type: "critical" | "normal" | string;
    text: string;
    color: string;
  };
  claimed: boolean;
  ticketOwner: string;
  status: "resolving" | string;
  solved: boolean;
  title: string;
  addUser: string[];
  category: {
    type: string;
    text: string;
  };
}
