/**
 * Players tab — DataTable of Minecraft players with search, status badges,
 * and action buttons (scaffold).
 */
"use client";

import { useEffect, useState } from "react";
import DataTable, { type Column } from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import { fetchApi } from "@/lib/api";

interface Player {
  _id: string;
  guildId: string;
  minecraftUsername: string;
  minecraftUuid: string;
  discordId?: string;
  discordUsername?: string;
  isWhitelisted: boolean;
  linkStatus: "unlinked" | "linking" | "linked";
  whitelistStatus: string;
  whitelistedAt?: string;
  linkedAt?: string;
  revokedAt?: string;
}

interface PlayersResponse {
  players: Player[];
  total: number;
  page: number;
  limit: number;
}

const columns: Column<Player>[] = [
  {
    key: "minecraftUsername",
    header: "Minecraft",
    render: (row) => (
      <div className="flex items-center gap-2">
        <img src={`https://mc-heads.net/avatar/${row.minecraftUuid ?? row.minecraftUsername}/24`} alt="" className="h-6 w-6 rounded" />
        <span className="font-medium text-zinc-100">{row.minecraftUsername}</span>
      </div>
    ),
  },
  {
    key: "discordUsername",
    header: "Discord",
    render: (row) => <span className="text-zinc-300">{row.discordUsername ?? <span className="text-zinc-600">Not linked</span>}</span>,
  },
  {
    key: "linkStatus",
    header: "Link Status",
    render: (row) => {
      const variants: Record<string, "success" | "warning" | "neutral"> = {
        linked: "success",
        linking: "warning",
        unlinked: "neutral",
      };
      return <StatusBadge variant={variants[row.linkStatus] ?? "neutral"}>{row.linkStatus}</StatusBadge>;
    },
  },
  {
    key: "isWhitelisted",
    header: "Whitelist",
    render: (row) => <StatusBadge variant={row.isWhitelisted ? "success" : "error"}>{row.isWhitelisted ? "Whitelisted" : "Not whitelisted"}</StatusBadge>,
  },
  {
    key: "actions",
    header: "",
    className: "w-12",
    render: () => (
      <button className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>
    ),
  },
];

export default function PlayersTab({ guildId }: { guildId: string }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchApi<PlayersResponse>(guildId, "minecraft/players?limit=100")
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setPlayers(res.data.players);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [guildId]);

  return (
    <DataTable
      columns={columns}
      data={players}
      searchKeys={["minecraftUsername", "discordUsername"]}
      searchPlaceholder="Search players..."
      loading={loading}
      emptyMessage="No players found. Players will appear here once they link their Minecraft account."
    />
  );
}
