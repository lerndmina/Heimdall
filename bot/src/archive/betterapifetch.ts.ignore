// Base URL for the NamelessMC API
export const API_V2 = env.BOT_URL + "/index.php?route=/api/v2";

type Route = {
  url: string;
  method: string;
  requiredParams: string[];
  optionalParams: string[];
};

type Routes = {
  [key: string]: Route;
};

type RequestOptions = {
  method: string;
  headers: { Authorization: string };
  body?: string;
};

const routes: Routes = {
  getUsers: {
    url: `${API_V2}/users`,
    method: "GET",
    requiredParams: ["limit"],
    optionalParams: ["banned", "verified", "discord_linked", "group_id", "operator"],
  },
  getUser: {
    url: `${API_V2}/users/{user}`,
    method: "GET",
    requiredParams: ["user"],
    optionalParams: [],
  },
  postIntegrationVerify: {
    url: `${API_V2}/integration/verify`,
    method: "POST",
    requiredParams: ["integration", "code", "identifier", "identifier"],
    optionalParams: [],
  },
};

type RouteName = "getUsers" | "getUser" | "postIntegrationVerify";

export async function namelessRequest(routeName: RouteName, params: { [key: string]: any }) {
  const route = routes[routeName];
  if (!route) {
    throw new Error(`Invalid route: ${routeName}`);
  }

  route.requiredParams.forEach((param: string) => {
    if (!(param in params)) {
      throw new Error(`Missing required param: ${param}`);
    }
  });

  let url = route.url;
  if (url.includes("{user}")) {
    if (!params.user) {
      throw new Error("Missing user param");
    }
    if (!validateUser(params.user)) {
      throw new Error("Invalid user param");
    }
    url = url.replace("{user}", params.user);
  }

  const options: RequestOptions = {
    method: route.method,
    headers: { Authorization: `Bearer ${env.NAMELESS_API_KEY}` },
  };

  if (route.method === "POST") {
    options.body = JSON.stringify(params);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

type UserFormat = "id" | "username" | "integration_id" | "integration_name";

/**
 * Validates a user string
 * @param user The user to validate
 * @returns The validated user, or false if the user is invalid
 * @example validateUser('id:3');  // Outputs: 'id:3'
 * validateUser('username:Samerton');  // Outputs: 'username:Samerton'
 * validateUser('integration_id:minecraft:09948878fe2044e3a07242c39869dd1f');  // Outputs: 'integration_id:minecraft:09948878fe2044e3a07242c39869dd1f'
 */
function validateUser(user: string): string | false {
  const [format, value] = user.split(":");

  if (!value) {
    return false;
  }

  switch (format as UserFormat) {
    case "id":
      return /^\d+$/.test(value) ? user : false;
    case "username":
      return /^[a-zA-Z0-9]+$/.test(value) ? user : false;
    case "integration_id":
    case "integration_name":
      const [integrationName, accountValue] = value.split(":");
      if (
        ["discord", "minecraft"].includes(integrationName.toLowerCase()) &&
        /^[a-zA-Z0-9#]+$/.test(accountValue)
      ) {
        return user;
      } else {
        return false;
      }
    default:
      return false;
  }
}
